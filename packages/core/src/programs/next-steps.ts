// A junior's real next steps from the programs calendar (PLAN D7, D11), today, not in theory.
//
// Why this exists: `upcomingWindows()` only matches windows with a concrete `opens` date, and every
// future window in `programs.json` has `opens: null` because the source has not published one. On
// 2026-09-17 that accessor returns nothing, so the honest-silence "next step" would be an empty
// list. This module fills it without inventing a single date:
//
//   - Genuinely open now: a window whose concrete dates contain today, or whose recurrence rule the
//     source states as rolling (Canonical's graduate role).
//   - Expected: a recurring window, rendered from the month the source itself names in its
//     recurrence rule, projected to its next occurrence and always marked as expected. The
//     window's own `confirmed` flag is carried through, so "stated by the source" and "inferred
//     from past years" never blur.
//
// Nothing here reads a date that `programs.json` does not state. A window with no concrete dates
// and no recurrence rule is skipped, not guessed at (`data/programs/README.md`).
//
// Output is i18n-ready keys and params, like the rest of the matcher. Pure and isomorphic.

import type { Seniority } from "../ways-of-working";
import type { Program, ProgramKind, ProgramWindow } from "./index";
import { loadPrograms } from "./index";

export const PROGRAM_REASONS = {
  "program-open-now": "{program} is open now.",
  "program-window-opens": "{program} opens on {date}.",
  "program-window-confirmed": "{program} usually opens in {month}, so {month} {year} is next.",
  "program-window-expected":
    "{program} has no {year} dates published; past years opened in {month}.",
  "program-expected-not-confirmed": "Inferred from past years, not yet stated by {organization}.",
  "program-stipend-country": "Stipend for {country}: {amount} {currency}.",
  "program-stipend-flat": "Stipend: {amount} {currency}.",
  "program-stipend-not-disclosed": "The stipend isn't published.",
  "program-stipend-education-credit": "Pays in university credit or an education stipend.",
  "program-remote": "Remote.",
  "program-min-age": "You must be {age} or older.",
  /** The constraint text is transcribed English from the data file; the UI shows it as-is. */
  "program-constraint": "{constraint}",
  "program-territory-caveat": "Not open in {territory}; check that isn't where you live.",
} as const;

export type ProgramReasonKey = keyof typeof PROGRAM_REASONS;

export interface ProgramReason {
  key: ProgramReasonKey;
  params: Record<string, string>;
}

export type ProgramStepKind = "open-now" | "opens-on" | "expected";

export interface ProgramNextStep {
  programId: string;
  programName: string;
  organization: string;
  kind: ProgramKind;
  step: ProgramStepKind;
  /** The window's own `confirmed` flag: false means inferred from past years, not stated. */
  confirmed: boolean;
  windowLabel: string;
  /** `YYYY-MM-DD` when the source states one, else null. */
  opensOn: string | null;
  /** `YYYY-MM` the window is expected to open, from the source's own recurrence rule, else null. */
  expectedMonth: string | null;
  headline: ProgramReason;
  /** Stipend, eligibility and caveat lines, in display order. */
  detail: readonly ProgramReason[];
  /** The user's own country's figure, never a range. Null when the data has none for them. */
  stipend: { currency: string; amount: number } | null;
  sourceUrl: string;
}

export interface ProgramNextStepsInput {
  /** ISO 3166-1 alpha-2, upper case. Null skips the eligibility filter and the per-country stipend. */
  country: string | null;
  /** Explicit clock. This package never calls `Date.now()`. */
  now: Date;
  /**
   * The user's level. Programs are an early-career route (PLAN D3, D11), so anything above junior
   * gets an empty list; the caller can simply not call this module for those users.
   */
  seniority: Seniority | null;
  /** Default 3. */
  limit?: number;
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

interface Recurrence {
  /** The source calls the window rolling, so it is open whenever it is listed. */
  rolling: boolean;
  /** 1-12, the month the source names for applications opening. Null when it names none. */
  month: number | null;
}

/**
 * Reads a transcribed recurrence sentence. Only the clause about applications *opening* is read,
 * so term dates in the same sentence ("term runs Mar 1 - May 31") are not mistaken for an opening
 * month. Full month names only; no abbreviation guessing.
 */
export function parseRecurrence(rule: string | null): Recurrence {
  if (!rule) return { rolling: false, month: null };
  if (/\brolling\b/i.test(rule)) return { rolling: true, month: null };

  const clauses = rule.split(";");
  const opening = clauses.find((clause) => /\bopens?\b|\bopening\b/i.test(clause)) ?? rule;
  for (const match of opening.matchAll(/\b([A-Z][a-z]+)\b/g)) {
    const index = MONTH_NAMES.indexOf((match[1] ?? "") as (typeof MONTH_NAMES)[number]);
    if (index >= 0) return { rolling: false, month: index + 1 };
  }
  return { rolling: false, month: null };
}

/** The next time month `month` (1-12) comes round after the month `now` is in. */
function nextOccurrence(month: number, now: Date): { year: number; month: number } {
  const year = month > now.getUTCMonth() + 1 ? now.getUTCFullYear() : now.getUTCFullYear() + 1;
  return { year, month };
}

function isoDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/**
 * Excluded for this country?
 *
 * Only an exact alpha-2 entry excludes. Sub-national entries like "UA-occupied DNR/LNR" cannot be
 * decided from a country code — GSoC and LFX both say Ukraine outside those territories is
 * eligible — so they never exclude; they come back as a caveat the user checks themselves.
 */
function exclusionFor(
  program: Program,
  country: string | null,
): { excluded: boolean; caveats: string[] } {
  const caveats: string[] = [];
  let excluded = false;
  for (const entry of program.eligibility.excludedCountries) {
    const trimmed = entry.trim();
    if (/^[A-Za-z]{2}$/.test(trimmed)) {
      if (country && trimmed.toUpperCase() === country.toUpperCase()) excluded = true;
      continue;
    }
    if (!country || trimmed.toUpperCase().startsWith(`${country.toUpperCase()}-`)) {
      caveats.push(trimmed);
    }
  }
  return { excluded, caveats };
}

interface Candidate {
  window: ProgramWindow;
  step: ProgramStepKind;
  opensOn: string | null;
  expectedMonth: string | null;
  /** Lower sorts first. */
  rank: number;
}

function candidateFor(window: ProgramWindow, now: Date): Candidate | null {
  const today = isoDay(now);
  const recurrence = parseRecurrence(window.recurring);

  if (window.opens !== null) {
    const closed = window.closes !== null && window.closes < today;
    if (!closed && window.opens <= today) {
      return { window, step: "open-now", opensOn: window.opens, expectedMonth: null, rank: 0 };
    }
    if (window.opens > today) {
      return { window, step: "opens-on", opensOn: window.opens, expectedMonth: null, rank: 1 };
    }
    // A dated window that has already closed is history, unless it also carries a recurrence rule.
  }

  if (recurrence.rolling) {
    return { window, step: "open-now", opensOn: null, expectedMonth: null, rank: 0 };
  }
  if (recurrence.month !== null) {
    const next = nextOccurrence(recurrence.month, now);
    const month = `${next.year}-${String(next.month).padStart(2, "0")}`;
    return {
      window,
      step: "expected",
      opensOn: null,
      expectedMonth: month,
      // Month first, then a stated window before one inferred from past years.
      rank: 2 + (next.year * 12 + next.month) * 2 + (window.confirmed ? 0 : 1),
    };
  }
  return null;
}

function stipendFor(
  program: Program,
  country: string | null,
): { value: { currency: string; amount: number } | null; reason: ProgramReason } {
  const { kind, currency, amount, byCountry } = program.stipend;
  if (kind === "per-country" && currency && byCountry && country) {
    const forCountry = byCountry[country.toUpperCase()];
    if (typeof forCountry === "number") {
      return {
        value: { currency, amount: forCountry },
        reason: {
          key: "program-stipend-country",
          params: { country: country.toUpperCase(), amount: String(forCountry), currency },
        },
      };
    }
  }
  if (kind === "flat" && currency && amount !== null) {
    return {
      value: { currency, amount },
      reason: { key: "program-stipend-flat", params: { amount: String(amount), currency } },
    };
  }
  if (kind === "education-credit") {
    return { value: null, reason: { key: "program-stipend-education-credit", params: {} } };
  }
  return { value: null, reason: { key: "program-stipend-not-disclosed", params: {} } };
}

function headlineFor(program: Program, candidate: Candidate): ProgramReason {
  const params: Record<string, string> = { program: program.name };
  if (candidate.step === "open-now") return { key: "program-open-now", params };
  if (candidate.step === "opens-on") {
    return { key: "program-window-opens", params: { ...params, date: candidate.opensOn ?? "" } };
  }
  const [year = "", month = "01"] = (candidate.expectedMonth ?? "").split("-");
  const monthName = MONTH_NAMES[Number(month) - 1] ?? "";
  return {
    key: candidate.window.confirmed ? "program-window-confirmed" : "program-window-expected",
    params: { ...params, month: monthName, year },
  };
}

let cached: readonly Program[] | null = null;

/** Validated programs, parsed once per process. */
export function allPrograms(): readonly Program[] {
  cached ??= loadPrograms().programs;
  return cached;
}

/**
 * The next real steps for one person, soonest first, at most one per program.
 *
 * On 2026-09-17 for a Moldovan junior this is Canonical's rolling graduate role (open now), then
 * LFX Mentorship's Spring term (source states applications open mid-January, so January 2027), then
 * Google Summer of Code's 2027 cycle (unconfirmed: the source says orgs usually open in January but
 * has published no 2027 dates).
 */
export function nextProgramSteps(
  input: ProgramNextStepsInput,
  programs: readonly Program[] = allPrograms(),
): ProgramNextStep[] {
  if (input.seniority !== null && input.seniority !== "intern" && input.seniority !== "junior") {
    return [];
  }

  const steps: Array<{ rank: number; step: ProgramNextStep }> = [];
  for (const program of programs) {
    const { excluded, caveats } = exclusionFor(program, input.country);
    if (excluded) continue;

    let best: Candidate | null = null;
    for (const window of program.windows) {
      const candidate = candidateFor(window, input.now);
      if (!candidate) continue;
      if (!best || candidate.rank < best.rank) best = candidate;
    }
    if (!best) continue;

    const stipend = stipendFor(program, input.country);
    const detail: ProgramReason[] = [stipend.reason];
    if (best.step === "expected" && !best.window.confirmed) {
      detail.push({
        key: "program-expected-not-confirmed",
        params: { organization: program.organization },
      });
    }
    if (program.remote) detail.push({ key: "program-remote", params: {} });
    if (program.eligibility.minAge !== null) {
      detail.push({ key: "program-min-age", params: { age: String(program.eligibility.minAge) } });
    }
    for (const constraint of program.eligibility.constraints) {
      detail.push({ key: "program-constraint", params: { constraint } });
    }
    for (const territory of caveats) {
      detail.push({ key: "program-territory-caveat", params: { territory } });
    }

    steps.push({
      rank: best.rank,
      step: {
        programId: program.id,
        programName: program.name,
        organization: program.organization,
        kind: program.kind,
        step: best.step,
        confirmed: best.window.confirmed,
        windowLabel: best.window.label,
        opensOn: best.opensOn,
        expectedMonth: best.expectedMonth,
        headline: headlineFor(program, best),
        detail,
        stipend: stipend.value,
        sourceUrl: program.sourceUrls[0] ?? "",
      },
    });
  }

  steps.sort((a, b) => a.rank - b.rank || a.step.programName.localeCompare(b.step.programName));
  return steps.slice(0, input.limit ?? 3).map((entry) => entry.step);
}
