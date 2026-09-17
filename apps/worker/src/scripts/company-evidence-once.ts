// Runs the company evidence check inline, without pg-boss, and prints what it found.
// Usage: pnpm --filter @pemby/worker company-evidence:once -- --company <id|domain>[,...] | --sample N
//          [--dry-run] [--model <openrouter model id>] [--discover-only] [--cache-dir <dir>]
//          [--dump-dir <dir>]
// --company may repeat. --dry-run writes no evidence; paid model calls are still recorded in
// ai_usage (run label suffixed ":dry-run") and count against the real daily cap.
// --discover-only fetches pages and calls no model (implies --dry-run). --cache-dir keeps HTTP
// responses on disk and replays them, so repeated runs send no requests. --dump-dir writes each
// company's pages and statements as JSON for hand checking.
// Needs DATABASE_URL, the private config (prompt `company-evidence`) and OPENROUTER_PUBLIC_API_KEY.
import { createDailyCapGuard, type RouteOverride } from "@pemby/ai";
import { createAiUsageLedger, createDb, schema } from "@pemby/db";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { and, eq, inArray, isNotNull, or, sql } from "drizzle-orm";
import {
  checkCompany,
  persistCompanyEvidence,
  type CompanyCheckResult,
  type CompanyForEvidence,
} from "../company-evidence/check";
import { discoverCompanyPages, normalizeDomain } from "../company-evidence/discover";
import { COMPANY_PAGE_MAX_RAW_BYTES, readCapped } from "../company-evidence/fetch";
import { pinnedTransport, type Transport } from "../company-evidence/net";

const { companies } = schema;

const USAGE =
  "usage: company-evidence:once -- --company <id|domain>[,...] | --sample N [--dry-run] [--model <id>] [--discover-only] [--cache-dir <dir>] [--dump-dir <dir>]";
const args = process.argv.slice(2).filter((a) => a !== "--");
const wanted: string[] = [];
let sample = 0;
let dryRun = false;
let model: string | null = null;
let discoverOnly = false;
let cacheDir: string | null = null;
let dumpDir: string | null = null;
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  const value = args[i + 1];
  if (arg === "--dry-run") dryRun = true;
  else if (arg === "--discover-only") {
    discoverOnly = true;
    dryRun = true;
  } else if (arg === "--cache-dir" && value) {
    cacheDir = value;
    i++;
  } else if (arg === "--dump-dir" && value) {
    dumpDir = value;
    i++;
  } else if (arg === "--company" && value) {
    wanted.push(
      ...value
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean),
    );
    i++;
  } else if (arg === "--sample" && value && /^\d+$/.test(value)) {
    sample = Number(value);
    i++;
  } else if (arg === "--model" && value) {
    model = value;
    i++;
  } else {
    console.error(USAGE);
    process.exit(2);
  }
}
if (wanted.length === 0 && sample === 0) {
  console.error(USAGE);
  process.exit(2);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const db = createDb(url, { max: 2 });
const controller = new AbortController();
process.on("SIGINT", () => controller.abort(new Error("interrupted")));

interface CachedResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

/**
 * A transport that replays responses stored under `dir` and stores the ones it has to send. Live
 * requests go through the pinned transport and keep at most the fetcher's raw byte cap.
 */
function cachingTransport(dir: string): Transport {
  return async (url, init) => {
    const file = join(
      dir,
      `${createHash("sha256").update(url.href).digest("hex").slice(0, 32)}.json`,
    );
    let cached: CachedResponse | null = null;
    try {
      cached = JSON.parse(await readFile(file, "utf8")) as CachedResponse;
    } catch {
      const res = await pinnedTransport(url, init);
      const headers: Record<string, string> = {};
      for (const name of ["content-type", "location"]) {
        const v = res.headers.get(name);
        if (v !== null) headers[name] = v;
      }
      const redirect = res.status >= 300 && res.status < 400;
      if (redirect) await res.body?.cancel().catch(() => undefined);
      const body = redirect ? "" : await readCapped(res, COMPANY_PAGE_MAX_RAW_BYTES);
      cached = { status: res.status, headers, body };
      await mkdir(dir, { recursive: true });
      await writeFile(file, JSON.stringify({ url: url.href, ...cached }));
    }
    const nullBody = cached.status === 204 || (cached.status >= 300 && cached.status < 400);
    return new Response(nullBody ? null : cached.body, {
      status: cached.status,
      headers: cached.headers,
    });
  };
}

const transport = cacheDir ? cachingTransport(cacheDir) : undefined;

/** Error name and code only; messages from the database driver or the model can carry data. */
function errorLabel(error: unknown): string {
  if (!(error instanceof Error)) return "error";
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" || typeof code === "number"
    ? `${error.name} code=${code}`
    : error.name;
}

const columns = {
  id: companies.id,
  name: companies.name,
  domain: companies.domain,
  careersUrl: companies.careersUrl,
  websiteUrl: companies.websiteUrl,
};

async function selectCompanies(): Promise<CompanyForEvidence[]> {
  const rows: Array<{
    id: string;
    name: string;
    domain: string | null;
    careersUrl: string | null;
    websiteUrl: string | null;
  }> = [];
  if (wanted.length > 0) {
    const ids = wanted.filter((w) => /^[0-9a-f-]{36}$/i.test(w));
    const domains = wanted.filter((w) => !ids.includes(w)).map(normalizeDomain);
    rows.push(
      ...(await db
        .select(columns)
        .from(companies)
        .where(
          or(
            ids.length ? inArray(companies.id, ids) : undefined,
            domains.length ? inArray(companies.domain, domains) : undefined,
          ),
        )),
    );
    const found = new Set(rows.flatMap((r) => [r.id, r.domain ? normalizeDomain(r.domain) : ""]));
    for (const w of wanted) {
      if (!found.has(w) && !found.has(normalizeDomain(w))) console.warn(`not found: ${w}`);
    }
  }
  if (sample > 0) {
    rows.push(
      ...(await db
        .select(columns)
        .from(companies)
        .where(and(isNotNull(companies.domain), eq(companies.isDemo, false)))
        .orderBy(sql`random()`)
        .limit(sample)),
    );
  }
  const unique = new Map<string, CompanyForEvidence>();
  for (const r of rows) {
    if (!r.domain) {
      console.warn(`skipped ${r.name}: no domain`);
      continue;
    }
    unique.set(r.id, { ...r, domain: normalizeDomain(r.domain) });
  }
  return [...unique.values()];
}

const ledger = createAiUsageLedger(db);
const capGuard = createDailyCapGuard({ ledger });
const routeOverride: RouteOverride | undefined = model ? { model } : undefined;

const totals = {
  companies: 0,
  pages: 0,
  kept: 0,
  dropped: 0,
  rows: 0,
  costUsd: 0,
  latencyMs: 0,
  failed: 0,
};
const verdicts: Record<string, number> = {};
const statuses: Record<string, number> = {};
const dropReasons: Record<string, number> = {};

try {
  const list = await selectCompanies();
  console.log(
    `company-evidence:once ${dryRun ? "DRY RUN (no writes)" : "WRITE"} companies=${list.length}${model ? ` model=${model}` : ""}`,
  );
  for (const company of list) {
    totals.companies += 1;
    const started = Date.now();
    console.log(`\n## ${company.name} (${company.domain}) ${company.id}`);
    try {
      const httpOptions = { signal: controller.signal, ...(transport ? { transport } : {}) };
      const result: CompanyCheckResult = discoverOnly
        ? {
            company,
            discovery: await discoverCompanyPages(
              { domain: company.domain, hintUrls: [company.careersUrl, company.websiteUrl] },
              httpOptions,
            ),
            extraction: null,
            rows: [],
            status: "none",
          }
        : await checkCompany(company, {
            ledger,
            capGuard,
            runLabel: dryRun ? "company-evidence:once:dry-run" : "company-evidence:once",
            ...httpOptions,
            ...(routeOverride ? { routeOverride } : {}),
          });
      const { discovery, extraction, rows, status } = result;
      if (dumpDir) {
        await mkdir(dumpDir, { recursive: true });
        await writeFile(
          join(dumpDir, `${company.domain}.json`),
          JSON.stringify({ ...result, ms: Date.now() - started }, null, 2),
        );
      }
      console.log(`requests=${discovery.requests} status=${status} ms=${Date.now() - started}`);
      for (const a of discovery.attempts) {
        const redirected = a.url !== a.requestedUrl ? ` -> ${a.url}` : "";
        console.log(
          `  fetch ${a.outcome}${a.status ? ` ${a.status}` : ""} ${a.requestedUrl}${redirected}`,
        );
      }
      console.log(`  pages sent: ${discovery.pages.map((p) => p.url).join(", ") || "none"}`);
      totals.pages += discovery.pages.length;
      if (extraction) {
        totals.kept += extraction.kept.length;
        totals.dropped += extraction.dropped.length;
        totals.costUsd += extraction.costUsd;
        totals.latencyMs += extraction.latencyMs;
        console.log(
          `  model=${extraction.model} outcome=${extraction.outcome} prompt=${extraction.promptVersion} cost=$${extraction.costUsd.toFixed(5)} latencyMs=${extraction.latencyMs} kept=${extraction.kept.length} dropped=${extraction.dropped.length}`,
        );
        for (const s of extraction.kept) {
          console.log(
            `  KEPT ${s.kind} ${s.confidence} places=[${s.places.join("; ")}] ways=${Array.isArray(s.waysOfWorking) ? s.waysOfWorking.join(",") || "-" : "all"} "${s.quote.slice(0, 140)}"`,
          );
        }
        for (const { statement: s, reason } of extraction.dropped) {
          dropReasons[reason] = (dropReasons[reason] ?? 0) + 1;
          console.log(
            `  DROPPED (${reason}) ${s.scope} ${s.confidence} ${s.kind} places=[${s.places.join("; ")}] "${s.quote.slice(0, 140)}"`,
          );
        }
        if (extraction.notes) console.log(`  notes: ${extraction.notes.slice(0, 300)}`);
      }
      for (const r of rows) {
        verdicts[r.verdict] = (verdicts[r.verdict] ?? 0) + 1;
        console.log(
          `  ROW scope=${r.scope} way=${r.wayOfWorking ?? "*"} verdict=${r.verdict} url=${r.sourceUrl}`,
        );
      }
      totals.rows += rows.length;
      statuses[status] = (statuses[status] ?? 0) + 1;
      if (!dryRun) {
        await persistCompanyEvidence(db, result);
        console.log(`  written: ${rows.length} rows, status ${status}`);
      }
    } catch (error) {
      if (controller.signal.aborted) throw error;
      totals.failed += 1;
      console.error(`  FAILED ${errorLabel(error)}`);
    }
  }
  console.log(
    `\nSUMMARY companies=${totals.companies} failed=${totals.failed} pagesSent=${totals.pages} kept=${totals.kept} dropped=${totals.dropped} dropReasons=${JSON.stringify(dropReasons)} rows=${totals.rows} verdicts=${JSON.stringify(verdicts)} statuses=${JSON.stringify(statuses)} cost=$${totals.costUsd.toFixed(5)} modelLatencyMs=${totals.latencyMs}`,
  );
} catch (error) {
  console.error(`company-evidence:once failed: ${errorLabel(error)}`);
  process.exitCode = 1;
} finally {
  await db.$client.end();
}
