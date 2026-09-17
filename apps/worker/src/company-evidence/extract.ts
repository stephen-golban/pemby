// Extraction of hiring-location statements from a company's pages (public key), quote
// verification against the fetched text, and the mapping to company-level `eligibility_evidence`.
import {
  runStructuredTask,
  type CostLedger,
  type DailyCapGuard,
  type RouteOverride,
  type StructuredTaskResult,
} from "@pemby/ai";
import { WAYS_OF_WORKING, findPlaceMentions, lookupPlace, type PlaceRef } from "@pemby/core";
import type { NewEligibilityEvidence } from "@pemby/db";
import { z } from "zod";
import type { DiscoveredPage } from "./discover";
import {
  CONTRACTOR_WORDS,
  HEDGE,
  NEGATION,
  hasPolicyLanguage,
  introducedByPolicy,
  saysWorldwide,
} from "./policy";

export const STATEMENT_KINDS = [
  "hires-in",
  "does-not-hire-in",
  "worldwide",
  "contractors-anywhere",
  "eor-provider",
] as const;
export type StatementKind = (typeof STATEMENT_KINDS)[number];

/** Only `company-policy` statements are kept; the others let the model set role lines aside. */
export const STATEMENT_SCOPES = [
  "company-policy",
  "single-role",
  "office-location",
  "other",
] as const;
export const STATEMENT_CONFIDENCE = ["high", "medium", "low"] as const;

/** Longest excerpt stored per row; a longer quote is cut to a verbatim window around the place. */
export const MAX_QUOTE_CHARS = 300;
/** Longest quote kept for verification (a country list can run past the excerpt length). */
const MAX_VERIFIED_QUOTE_CHARS = 2_000;

// Strict JSON schema mode: every property is required; absent values are null or empty.
const statementSchema = z.object({
  scope: z.enum(STATEMENT_SCOPES),
  confidence: z.enum(STATEMENT_CONFIDENCE),
  kind: z.enum(STATEMENT_KINDS),
  places: z.array(z.string()),
  waysOfWorking: z.union([z.array(z.enum(WAYS_OF_WORKING)), z.literal("all")]),
  quote: z.string(),
  pageUrl: z.string(),
});

export const companyEvidenceOutputSchema = z.object({
  statements: z.array(statementSchema),
  notes: z.string().nullable(),
});
export type CompanyEvidenceOutput = z.infer<typeof companyEvidenceOutputSchema>;
export type CompanyEvidenceStatement = z.infer<typeof statementSchema>;

export interface CompanyRef {
  id: string;
  name: string;
  domain: string;
}

export interface ExtractOptions {
  ledger: CostLedger;
  capGuard: DailyCapGuard;
  runLabel: string;
  routeOverride?: RouteOverride;
  env?: Readonly<Record<string, string | undefined>>;
  /** Aborts the model call (job cancellation or the check's deadline). */
  signal?: AbortSignal;
  /** Per model attempt. */
  timeoutMs?: number;
}

/** A statement that passed verification; `places` holds only the places its quote names. */
export interface VerifiedStatement extends CompanyEvidenceStatement {
  /** Hedged wording ("may consider", "in some cases"): never proof for a country. */
  hedged: boolean;
  /** The page whose text contains the quote (may differ from the model's `pageUrl`). */
  verifiedUrl: string;
  fetchedAt: Date;
}

export type DropReason =
  | "not-company-policy"
  | "low-confidence"
  | "quote-not-found"
  | "quote-too-short"
  | "job-listing"
  | "no-policy-language"
  | "no-worldwide-word"
  | "no-contractor-word"
  | "no-negation"
  | "places-not-in-quote";

export interface DroppedStatement {
  statement: CompanyEvidenceStatement;
  reason: DropReason;
}

export interface ExtractionResult {
  kept: VerifiedStatement[];
  /** Statements not kept: quote not verbatim in any fetched page, or not about hiring. */
  dropped: DroppedStatement[];
  notes: string | null;
  model: string;
  promptVersion: string;
  costUsd: number;
  latencyMs: number;
  outcome: StructuredTaskResult<CompanyEvidenceOutput>["outcome"];
}

export function buildExtractionInput(company: CompanyRef, pages: readonly DiscoveredPage[]) {
  const blocks = pages.map(
    (page, i) => `=== Page ${i + 1}\nURL: ${page.url}\n\n${page.excerpt}\n=== End of page ${i + 1}`,
  );
  return [
    `Company: ${company.name}`,
    `Domain: ${company.domain}`,
    `Pages: ${pages.length} public careers or hiring-policy page(s), trimmed to passages about locations. "[...]" marks omitted text.`,
    "",
    ...blocks,
  ].join("\n");
}

/** Whitespace-only normalization, as the verification rule allows. */
function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/** Words that put the place right after them outside the statement ("outside the U.S."). */
const EXCLUDED_BEFORE =
  /\b(?:outside(?: of)?|except(?: for| in)?|excluding|other than|not in|besides|apart from|non)[\s-]+(?:the\s+)?$/i;

/**
 * True when the quote itself names `place` (by name or code). With `positive`, a mention right
 * after "outside", "except" or "other than" does not count: "team members outside the U.S. are
 * employed through an EOR" says nothing about EOR in the U.S.
 */
function placeInQuote(place: string, quote: string, positive: boolean): boolean {
  const target = resolvePlaces(place);
  if (target.length === 0) return false;
  const counts = (start: number) =>
    !positive || !EXCLUDED_BEFORE.test(quote.slice(Math.max(0, start - 30), start));
  const found = new Set(
    findPlaceMentions(quote)
      .filter((m) => counts(m.start))
      .flatMap((m) =>
        m.ref.type === "country" ? [m.ref.country] : m.ref.type === "region" ? [m.ref.region] : [],
      ),
  );
  if (target.every((t) => found.has(t.code))) return true;
  // Abbreviations the place dictionary leaves out ("U.S.", "UK") still have to be in the quote.
  const escaped = place.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (escaped.length < 2) return false;
  const re = new RegExp(`(?:^|[^\\p{L}])(${escaped})(?:$|[^\\p{L}])`, "giu");
  return [...quote.matchAll(re)].some((m) => counts(m.index + m[0].indexOf(m[1] ?? "")));
}

/** Characters before a quote searched for the sentence introducing a list. */
const LEAD_CHARS = 1_200;

/**
 * The checks a statement must pass besides the model's own scope: a verbatim quote outside job
 * listings, hiring-policy wording, and wording that fits the kind (an explicit worldwide word for
 * `worldwide`, a negation for `does-not-hire-in`, the places named in the quote itself). Returns
 * the statement with only the places its quote names, or the reason to drop it.
 */
function checkStatement(
  statement: CompanyEvidenceStatement,
  quote: string,
  lead: string,
): { ok: true; places: string[] } | { ok: false; reason: DropReason } {
  // A list may take its policy wording from the sentence introducing it; a worldwide claim or an
  // exclusion must carry its own.
  const listKind = statement.kind === "hires-in" || statement.kind === "eor-provider";
  if (!hasPolicyLanguage(quote) && !(listKind && introducedByPolicy(lead))) {
    return { ok: false, reason: "no-policy-language" };
  }
  const positive = statement.kind !== "does-not-hire-in";
  const places = statement.places.filter((p) => placeInQuote(p, quote, positive));
  switch (statement.kind) {
    case "worldwide":
      return saysWorldwide(quote)
        ? { ok: true, places: [] }
        : { ok: false, reason: "no-worldwide-word" };
    case "contractors-anywhere":
      if (!CONTRACTOR_WORDS.test(quote)) return { ok: false, reason: "no-contractor-word" };
      return saysWorldwide(quote)
        ? { ok: true, places: [] }
        : { ok: false, reason: "no-worldwide-word" };
    case "hires-in":
      return places.length > 0
        ? { ok: true, places }
        : { ok: false, reason: "places-not-in-quote" };
    case "does-not-hire-in":
      if (!NEGATION.test(quote)) return { ok: false, reason: "no-negation" };
      return places.length > 0
        ? { ok: true, places }
        : { ok: false, reason: "places-not-in-quote" };
    case "eor-provider":
      return { ok: true, places };
  }
}

/**
 * Keeps statements the model marked as company policy with medium or high confidence (high for
 * `hires-in` and `does-not-hire-in`, which can make a country green or red), whose quote appears
 * verbatim in a fetched page (the claimed page first) outside its job listings, and which pass
 * `checkStatement`.
 */
export function verifyStatements(
  statements: readonly CompanyEvidenceStatement[],
  pages: readonly DiscoveredPage[],
): { kept: VerifiedStatement[]; dropped: DroppedStatement[] } {
  const normalized = pages.map((page) => ({
    page,
    text: normalizeWhitespace(page.text),
    policyText: normalizeWhitespace(page.policyText),
  }));
  const kept: VerifiedStatement[] = [];
  const dropped: DroppedStatement[] = [];
  const drop = (statement: CompanyEvidenceStatement, reason: DropReason) =>
    dropped.push({ statement, reason });
  for (const statement of statements) {
    if (statement.scope !== "company-policy") {
      drop(statement, "not-company-policy");
      continue;
    }
    const countryLevel = statement.kind === "hires-in" || statement.kind === "does-not-hire-in";
    if (statement.confidence === "low" || (countryLevel && statement.confidence !== "high")) {
      drop(statement, "low-confidence");
      continue;
    }
    const quote = normalizeWhitespace(statement.quote);
    if (quote.length < 8) {
      drop(statement, "quote-too-short");
      continue;
    }
    const ordered = [
      ...normalized.filter((p) => p.page.url === statement.pageUrl),
      ...normalized.filter((p) => p.page.url !== statement.pageUrl),
    ];
    if (!ordered.some((p) => p.text.includes(quote))) {
      drop(statement, "quote-not-found");
      continue;
    }
    const hit = ordered.find((p) => p.policyText.includes(quote));
    if (!hit) {
      drop(statement, "job-listing");
      continue;
    }
    const at = hit.policyText.indexOf(quote);
    const lead = hit.policyText.slice(Math.max(0, at - LEAD_CHARS), at);
    const check = checkStatement(statement, quote, lead);
    if (!check.ok) {
      drop(statement, check.reason);
      continue;
    }
    const duplicate = kept.some(
      (k) => k.kind === statement.kind && k.quote === quote.slice(0, MAX_VERIFIED_QUOTE_CHARS),
    );
    if (duplicate) continue;
    kept.push({
      ...statement,
      places: check.places,
      hedged: HEDGE.test(quote),
      quote: quote.slice(0, MAX_VERIFIED_QUOTE_CHARS),
      verifiedUrl: hit.page.url,
      fetchedAt: hit.page.fetchedAt,
    });
  }
  return { kept, dropped };
}

export async function extractCompanyEvidence(
  company: CompanyRef,
  pages: readonly DiscoveredPage[],
  options: ExtractOptions,
): Promise<ExtractionResult> {
  const result = await runStructuredTask({
    task: "company-evidence",
    schema: companyEvidenceOutputSchema,
    input: buildExtractionInput(company, pages),
    ledger: options.ledger,
    capGuard: options.capGuard,
    context: { companyId: company.id, runLabel: options.runLabel },
    ...(options.routeOverride ? { routeOverride: options.routeOverride } : {}),
    ...(options.env ? { env: options.env } : {}),
    ...(options.timeoutMs ? { timeoutMs: options.timeoutMs } : {}),
    ...(options.signal ? { abortSignal: options.signal } : {}),
  });
  const { kept, dropped } = verifyStatements(result.data.statements, pages);
  return {
    kept,
    dropped,
    notes: result.data.notes,
    model: result.model,
    promptVersion: result.promptVersion,
    costUsd: result.costUsd,
    latencyMs: result.latencyMs,
    outcome: result.outcome,
  };
}

type Tier = NewEligibilityEvidence["verdict"];
type DbWayOfWorking = NonNullable<NewEligibilityEvidence["wayOfWorking"]>;

type ResolvedPlace =
  | { kind: "country"; code: string; via: "country" | "subdivision" | "city" }
  | { kind: "region"; code: string };

/** Countries and regions named in one `places` entry; ambiguous names ("Georgia") resolve to none. */
export function resolvePlaces(place: string): ResolvedPlace[] {
  const toResolved = (ref: PlaceRef): ResolvedPlace | null =>
    ref.type === "country"
      ? { kind: "country", code: ref.country, via: ref.via }
      : ref.type === "region"
        ? { kind: "region", code: ref.region }
        : null;
  const direct = lookupPlace(place);
  if (direct) {
    const resolved = toResolved(direct);
    return resolved ? [resolved] : [];
  }
  return findPlaceMentions(place)
    .map((m) => toResolved(m.ref))
    .filter((r): r is ResolvedPlace => r !== null);
}

function dbWays(ways: CompanyEvidenceStatement["waysOfWorking"]): Array<DbWayOfWorking | null> {
  // Every way listed means no limit.
  if (ways === "all" || ways.length === 0 || new Set(ways).size === WAYS_OF_WORKING.length) {
    return [null];
  }
  return [...new Set(ways)].map((w) => w.replace(/-/g, "_") as DbWayOfWorking);
}

export interface EvidenceRowContext {
  companyId: string;
  extractorVersion: string;
}

/** Row fields before the company and version are attached. */
interface Draft {
  scope: string;
  wayOfWorking: DbWayOfWorking | null;
  verdict: Tier;
  excerpt: string;
}

/**
 * At most MAX_QUOTE_CHARS of the quote, verbatim: the start when `place` falls inside it, else a
 * window beginning shortly before the place.
 */
export function excerptFor(quote: string, place?: string): string {
  if (quote.length <= MAX_QUOTE_CHARS) return quote;
  const at = place ? quote.toLowerCase().indexOf(place.trim().toLowerCase()) : -1;
  if (at < 0 || at + (place?.length ?? 0) <= MAX_QUOTE_CHARS) {
    return quote.slice(0, MAX_QUOTE_CHARS);
  }
  let start = Math.max(0, at - 100);
  const space = quote.indexOf(" ", start);
  if (space >= 0 && space < at) start = space + 1;
  return quote.slice(start, start + MAX_QUOTE_CHARS);
}

function draftsFor(statement: VerifiedStatement): Draft[] {
  const ways = dbWays(statement.waysOfWorking);
  const places = statement.places.flatMap((name) =>
    resolvePlaces(name).map((p) => ({ ...p, name })),
  );
  const per = (scope: string, verdict: Tier, wayList = ways, place?: string): Draft[] =>
    wayList.map((wayOfWorking) => ({
      scope,
      wayOfWorking,
      verdict,
      excerpt: excerptFor(statement.quote, place),
    }));

  switch (statement.kind) {
    case "hires-in":
      // A named country is green; a city or state only shows presence there (yellow); a region is
      // never proof for any one country inside it (yellow for the region scope); hedged wording
      // ("may consider hiring as a contractor") is yellow.
      return places.flatMap((p) =>
        p.kind === "country"
          ? per(p.code, p.via === "country" && !statement.hedged ? "green" : "yellow", ways, p.name)
          : per(p.code, "yellow", ways, p.name),
      );
    case "does-not-hire-in":
      // A city or state exclusion says nothing about the rest of the country.
      return places.flatMap((p) =>
        p.kind === "region" || p.via === "country" ? per(p.code, "red", ways, p.name) : [],
      );
    case "worldwide":
      return per("*", "yellow");
    case "contractors-anywhere":
      return per("*", "yellow", ["b2b_contractor", "freelance"]);
    case "eor-provider":
      // Using an employer of record shows a path exists, not willingness: yellow for EOR only,
      // and only where the page names places.
      return places.flatMap((p) => per(p.code, "yellow", ["eor_employee"], p.name));
  }
}

/** `eligibility_evidence` rows (subject company, source careers_page), one per scope, way and verdict. */
export function statementsToEvidenceRows(
  statements: readonly VerifiedStatement[],
  context: EvidenceRowContext,
): NewEligibilityEvidence[] {
  const rows = new Map<string, NewEligibilityEvidence>();
  for (const statement of statements) {
    for (const draft of draftsFor(statement)) {
      const key = `${draft.scope}|${draft.wayOfWorking ?? "-"}|${draft.verdict}`;
      if (rows.has(key)) continue;
      rows.set(key, {
        subject: "company",
        companyId: context.companyId,
        jobId: null,
        scope: draft.scope,
        wayOfWorking: draft.wayOfWorking,
        verdict: draft.verdict,
        source: "careers_page",
        weight: 1,
        excerpt: draft.excerpt,
        sourceUrl: statement.verifiedUrl,
        fetchedAt: statement.fetchedAt,
        extractorVersion: context.extractorVersion,
      });
    }
  }
  return [...rows.values()];
}
