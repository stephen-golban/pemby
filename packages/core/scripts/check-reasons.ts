// Fails when the English in `@pemby/core` drifts from its twin in `apps/web/messages/en/*.json`.
// Usage: pnpm --filter @pemby/core check:reasons
//
// Why this exists. The same reason key is rendered twice by two different mechanisms: the Brief
// renders it through next-intl from the JSON, and Telegram, email and push render it through
// `renderGateReason` / `renderScoreReason` from the table in core, because the worker and the bot
// cannot read a next-intl catalogue. Until phase 08 nothing compared the two. A reason edited on one
// side and not the other would have made one match read two different ways depending on where the
// user saw it, and nobody would have found out from a typecheck, a lint or a build.
//
// Three things this script is careful about, all learned the hard way:
//
//   - **It imports the real modules.** The tables hold multi-line string literals and concatenated
//     ones, so a regex over the `.ts` source gives a confidently wrong answer.
//   - **It compares in both directions.** A key only in core is the drift that happens first —
//     someone adds a reason and does not touch the web file — but a key left behind in the JSON
//     after core drops one is just as real, and a checker that only walks core's keys never sees it.
//   - **It reads the catalogue the way next-intl does**, by deep-merging every `*.json` under
//     `messages/en/` in name order, rather than opening `brief.json` alone. Phase 08's checker knew
//     about one file, so a core table whose web twin lived in another namespace simply could not be
//     watched — and the fix for that was never to add the pair, which is how copy leaves the
//     checker's sight in the first place. Paths below are fully qualified from the catalogue root
//     (`Brief.gateReasons`, `Tracker.columns`), exactly as a `useTranslations` call would spell them.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DELIVERY_STRINGS,
  TIER_VERDICTS,
  TRACKER_COLUMN_LABELS,
  WAY_LABELS,
} from "../src/delivery/strings/en";
import { ENGINE_REASONS } from "../src/eligibility/engine/reasons";
import { GATE_REASONS } from "../src/gates/reasons";
import { PROGRAM_REASONS } from "../src/programs/next-steps";
import { SCORE_REASONS } from "../src/scoring/reasons";

/** `tsx` resolves a relative path from the package directory, so the files are found from this one. */
const MESSAGES_DIR = fileURLToPath(new URL("../../../apps/web/messages/en", import.meta.url));

type Table = Record<string, string>;

/** A whole core table against a whole web table, compared in both directions. */
interface Pair {
  /** What the failure output calls it: the core table's own name. */
  table: string;
  /** Where the core table lives, so a reader can open it without grepping. */
  source: string;
  core: Table;
  /** Dotted path from the catalogue root. The two names do not always match. */
  webPath: string;
}

/**
 * One key against one path, for a string whose web twin lives inside a namespace core has no
 * business mirroring whole.
 *
 * `Brief.match` holds twenty keys of page furniture — headings, empty states, button labels for
 * controls the card does not have — and only two of them are also delivery copy. A whole-table pair
 * would report the other eighteen as drift on every run, so the honest shape for these is a named
 * one-to-one. Both directions collapse to the same check here: two strings, equal or not.
 */
interface Single {
  table: string;
  source: string;
  core: Table;
  key: string;
  /** Dotted path from the catalogue root, as the JSON nests it. */
  webPath: string;
}

const PAIRS: Pair[] = [
  {
    table: "GATE_REASONS",
    source: "packages/core/src/gates/reasons.ts",
    core: GATE_REASONS,
    webPath: "Brief.gateReasons",
  },
  {
    table: "SCORE_REASONS",
    source: "packages/core/src/scoring/reasons.ts",
    core: SCORE_REASONS,
    webPath: "Brief.scoreReasons",
  },
  {
    table: "ENGINE_REASONS",
    source: "packages/core/src/eligibility/engine/reasons.ts",
    core: ENGINE_REASONS,
    // Not `engineReasons`: the web calls the engine's verdicts eligibility reasons.
    webPath: "Brief.eligibilityReasons",
  },
  {
    table: "PROGRAM_REASONS",
    source: "packages/core/src/programs/next-steps.ts",
    core: PROGRAM_REASONS,
    webPath: "Brief.programReasons",
  },
  {
    table: "TIER_VERDICTS",
    source: "packages/core/src/delivery/strings/en.ts",
    core: TIER_VERDICTS,
    webPath: "Brief.tier",
  },
  {
    table: "WAY_LABELS",
    source: "packages/core/src/delivery/strings/en.ts",
    core: WAY_LABELS,
    webPath: "Brief.way",
  },
  {
    table: "TRACKER_COLUMN_LABELS",
    source: "packages/core/src/delivery/strings/en.ts",
    core: TRACKER_COLUMN_LABELS,
    webPath: "Tracker.columns",
  },
];

const SINGLES: Single[] = [
  {
    table: "DELIVERY_STRINGS",
    source: "packages/core/src/delivery/strings/en.ts",
    core: DELIVERY_STRINGS,
    key: "reasons-label",
    webPath: "Brief.match.reasonsLabel",
  },
  {
    table: "DELIVERY_STRINGS",
    source: "packages/core/src/delivery/strings/en.ts",
    core: DELIVERY_STRINGS,
    key: "gap-label",
    webPath: "Brief.match.gapLabel",
  },
];

// Delivery copy (`src/delivery/strings/en.ts`) is only partly twinned. When a key there gains a web
// twin — a settings string, say — add the pair or the single above and it is covered from that
// moment.
//
// It also has no *core* twin: the delivery table used to carry byte copies of the freshness gate's
// two sentences, which this checker could not see, so `card.ts` renders those through
// `renderGateReason` instead. Copy a string out of a table this file watches and it leaves the
// checker's sight — the fix is never to copy it.

/** Every `messages/en/*.json`, deep-merged in name order, exactly as `apps/web/i18n/request.ts`. */
function loadMessages(): Record<string, unknown> {
  const names = readdirSync(MESSAGES_DIR)
    .filter((name) => name.endsWith(".json"))
    .sort();
  if (names.length === 0) throw new Error(`no *.json in ${MESSAGES_DIR}`);

  const merge = (target: Record<string, unknown>, source: Record<string, unknown>) => {
    for (const [key, value] of Object.entries(source)) {
      const existing = target[key];
      target[key] =
        isRecord(existing) && isRecord(value) ? merge({ ...existing }, value) : (value as unknown);
    }
    return target;
  };

  const out: Record<string, unknown> = {};
  for (const name of names) {
    const parsed: unknown = JSON.parse(readFileSync(join(MESSAGES_DIR, name), "utf8"));
    if (!isRecord(parsed)) throw new Error(`${name} is not a JSON object`);
    merge(out, parsed);
  }
  return out;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The value at a dotted path, or undefined when any step is missing. */
function readWebNode(messages: unknown, webPath: string): unknown {
  let node: unknown = messages;
  for (const step of webPath.split(".")) {
    if (!isRecord(node)) return undefined;
    node = node[step];
  }
  return node;
}

/** One value at a dotted path, or null if it is missing or is not a string. */
function readWebString(messages: unknown, webPath: string): string | null {
  const node = readWebNode(messages, webPath);
  return typeof node === "string" ? node : null;
}

function readWebTable(messages: unknown, webPath: string): Table | null {
  const node = readWebNode(messages, webPath);
  if (!isRecord(node)) return null;

  const out: Table = {};
  for (const [key, value] of Object.entries(node)) {
    if (typeof value !== "string") return null;
    out[key] = value;
  }
  return out;
}

/**
 * True when the whole top-level namespace is absent from the catalogue.
 *
 * This is the one case that is reported and **not** failed, and it exists for exactly one
 * situation: core's half of a twin landing in an earlier order than the web file that holds the
 * other half. The moment the namespace appears — with the table, without it, or with one letter
 * different — the pair is compared like any other and a mismatch fails the run. So it cannot hide
 * drift; it can only defer a comparison that has nothing to compare against yet.
 *
 * A pair left pending for a whole phase is a pair whose web twin was never written, which the
 * PENDING lines below are loud enough to make someone notice.
 */
function namespaceMissing(messages: Record<string, unknown>, webPath: string): boolean {
  const [namespace] = webPath.split(".");
  return namespace === undefined || !Object.hasOwn(messages, namespace);
}

function compare(pair: Pair, web: Table): string[] {
  const problems: string[] = [];
  const where = `${pair.table} (${pair.source}) vs ${pair.webPath}`;

  for (const [key, coreValue] of Object.entries(pair.core)) {
    const webValue = web[key];
    if (webValue === undefined) {
      problems.push(`${where}\n  MISSING IN WEB   ${key}\n    core: ${JSON.stringify(coreValue)}`);
    } else if (webValue !== coreValue) {
      problems.push(
        `${where}\n  DIFFERENT        ${key}\n    core: ${JSON.stringify(coreValue)}\n    web:  ${JSON.stringify(webValue)}`,
      );
    }
  }

  for (const [key, webValue] of Object.entries(web)) {
    // `hasOwn`, not `in`: `in` walks the prototype chain, so a web key called `toString` or
    // `constructor` would be reported as present in core and never flagged.
    if (!Object.hasOwn(pair.core, key)) {
      problems.push(`${where}\n  MISSING IN CORE  ${key}\n    web:  ${JSON.stringify(webValue)}`);
    }
  }

  return problems;
}

let messages: Record<string, unknown>;
try {
  messages = loadMessages();
} catch (error) {
  console.error(
    `could not read ${MESSAGES_DIR}: ${error instanceof Error ? error.message : "error"}`,
  );
  process.exit(1);
}

const problems: string[] = [];
const pending: string[] = [];

for (const pair of PAIRS) {
  if (namespaceMissing(messages, pair.webPath)) {
    pending.push(`${pair.table} -> ${pair.webPath} (namespace not in apps/web/messages/en yet)`);
    continue;
  }
  const web = readWebTable(messages, pair.webPath);
  if (web === null) {
    problems.push(`${pair.webPath} is missing from the catalogue, or is not a table of strings`);
    continue;
  }
  const found = compare(pair, web);
  problems.push(...found);
  if (found.length === 0) {
    console.log(
      `ok  ${pair.table.padEnd(21)} ${String(Object.keys(pair.core).length).padStart(3)} keys = ${pair.webPath}`,
    );
  }
}

for (const single of SINGLES) {
  const where = `${single.table}["${single.key}"] (${single.source}) vs ${single.webPath}`;
  const coreValue = Object.hasOwn(single.core, single.key) ? single.core[single.key] : undefined;

  if (namespaceMissing(messages, single.webPath)) {
    pending.push(
      `${single.table}["${single.key}"] -> ${single.webPath} (namespace not in web yet)`,
    );
    continue;
  }
  const webValue = readWebString(messages, single.webPath);

  if (coreValue === undefined) {
    problems.push(`${where}\n  MISSING IN CORE  ${single.key}`);
  } else if (webValue === null) {
    problems.push(
      `${where}\n  MISSING IN WEB   ${single.webPath}\n    core: ${JSON.stringify(coreValue)}`,
    );
  } else if (webValue !== coreValue) {
    problems.push(
      `${where}\n  DIFFERENT        ${single.key}\n    core: ${JSON.stringify(coreValue)}\n    web:  ${JSON.stringify(webValue)}`,
    );
  } else {
    console.log(`ok  ${single.table}["${single.key}"] = ${single.webPath}`);
  }
}

for (const line of pending) console.log(`PENDING  ${line}`);

if (problems.length > 0) {
  console.error(`\n${problems.length} reason string(s) have drifted:\n`);
  for (const problem of problems) console.error(`${problem}\n`);
  console.error("Core and apps/web/messages/en must hold byte-identical English.");
  process.exit(1);
}

console.log(
  pending.length > 0 ? `\nno drift (${pending.length} pair(s) pending a web file)` : "\nno drift",
);
