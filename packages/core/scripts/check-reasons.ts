// Fails when the English in `@pemby/core` drifts from its twin in `apps/web/messages/en/brief.json`.
// Usage: pnpm --filter @pemby/core check:reasons
//
// Why this exists. The same reason key is rendered twice by two different mechanisms: the Brief
// renders it through next-intl from the JSON, and Telegram, email and push render it through
// `renderGateReason` / `renderScoreReason` from the table in core, because the worker and the bot
// cannot read a next-intl catalogue. Until phase 08 nothing compared the two. A reason edited on one
// side and not the other would have made one match read two different ways depending on where the
// user saw it, and nobody would have found out from a typecheck, a lint or a build.
//
// Two things this script is careful about, both learned the hard way:
//
//   - **It imports the real modules.** The tables hold multi-line string literals and concatenated
//     ones, so a regex over the `.ts` source gives a confidently wrong answer.
//   - **It compares in both directions.** A key only in core is the drift that happens first —
//     someone adds a reason and does not touch the web file — but a key left behind in the JSON
//     after core drops one is just as real, and a checker that only walks core's keys never sees it.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DELIVERY_STRINGS, TIER_VERDICTS, WAY_LABELS } from "../src/delivery/strings/en";
import { ENGINE_REASONS } from "../src/eligibility/engine/reasons";
import { GATE_REASONS } from "../src/gates/reasons";
import { PROGRAM_REASONS } from "../src/programs/next-steps";
import { SCORE_REASONS } from "../src/scoring/reasons";

/** `tsx` resolves a relative path from the package directory, so the file is found from this one. */
const BRIEF_MESSAGES = fileURLToPath(
  new URL("../../../apps/web/messages/en/brief.json", import.meta.url),
);

type Table = Record<string, string>;

/** A whole core table against a whole `Brief.*` table, compared in both directions. */
interface Pair {
  /** What the failure output calls it: the core table's own name. */
  table: string;
  /** Where the core table lives, so a reader can open it without grepping. */
  source: string;
  core: Table;
  /** Key under `Brief` in `brief.json`. The two names do not always match. */
  webKey: string;
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
  /** Dotted path under `Brief`, as `brief.json` nests it. */
  webPath: string;
}

const PAIRS: Pair[] = [
  {
    table: "GATE_REASONS",
    source: "packages/core/src/gates/reasons.ts",
    core: GATE_REASONS,
    webKey: "gateReasons",
  },
  {
    table: "SCORE_REASONS",
    source: "packages/core/src/scoring/reasons.ts",
    core: SCORE_REASONS,
    webKey: "scoreReasons",
  },
  {
    table: "ENGINE_REASONS",
    source: "packages/core/src/eligibility/engine/reasons.ts",
    core: ENGINE_REASONS,
    // Not `engineReasons`: the web calls the engine's verdicts eligibility reasons.
    webKey: "eligibilityReasons",
  },
  {
    table: "PROGRAM_REASONS",
    source: "packages/core/src/programs/next-steps.ts",
    core: PROGRAM_REASONS,
    webKey: "programReasons",
  },
  {
    table: "TIER_VERDICTS",
    source: "packages/core/src/delivery/strings/en.ts",
    core: TIER_VERDICTS,
    webKey: "tier",
  },
  {
    table: "WAY_LABELS",
    source: "packages/core/src/delivery/strings/en.ts",
    core: WAY_LABELS,
    webKey: "way",
  },
];

const SINGLES: Single[] = [
  {
    table: "DELIVERY_STRINGS",
    source: "packages/core/src/delivery/strings/en.ts",
    core: DELIVERY_STRINGS,
    key: "reasons-label",
    webPath: "match.reasonsLabel",
  },
  {
    table: "DELIVERY_STRINGS",
    source: "packages/core/src/delivery/strings/en.ts",
    core: DELIVERY_STRINGS,
    key: "gap-label",
    webPath: "match.gapLabel",
  },
];

// Delivery copy (`src/delivery/strings/en.ts`) has no web twin yet. When a key there gains one —
// a settings string, say — add the pair above and it is covered from that moment.
//
// It also has no *core* twin: the delivery table used to carry byte copies of the freshness gate's
// two sentences, which this checker could not see, so `card.ts` renders those through
// `renderGateReason` instead. Copy a string out of a table this file watches and it leaves the
// checker's sight — the fix is never to copy it.

/** One value at a dotted path under `Brief`, or null if it is missing or is not a string. */
function readWebString(messages: unknown, webPath: string): string | null {
  let node: unknown = messages;
  for (const step of ["Brief", ...webPath.split(".")]) {
    if (typeof node !== "object" || node === null) return null;
    node = (node as Record<string, unknown>)[step];
  }
  return typeof node === "string" ? node : null;
}

function readWebTable(messages: unknown, webKey: string): Table | null {
  if (typeof messages !== "object" || messages === null) return null;
  const brief = (messages as Record<string, unknown>)["Brief"];
  if (typeof brief !== "object" || brief === null) return null;
  const table = (brief as Record<string, unknown>)[webKey];
  if (typeof table !== "object" || table === null) return null;

  const out: Table = {};
  for (const [key, value] of Object.entries(table as Record<string, unknown>)) {
    if (typeof value !== "string") return null;
    out[key] = value;
  }
  return out;
}

function compare(pair: Pair, web: Table): string[] {
  const problems: string[] = [];
  const where = `${pair.table} (${pair.source}) vs Brief.${pair.webKey}`;

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

let messages: unknown;
try {
  messages = JSON.parse(readFileSync(BRIEF_MESSAGES, "utf8"));
} catch (error) {
  console.error(
    `could not read ${BRIEF_MESSAGES}: ${error instanceof Error ? error.name : "error"}`,
  );
  process.exit(1);
}

const problems: string[] = [];
for (const pair of PAIRS) {
  const web = readWebTable(messages, pair.webKey);
  if (web === null) {
    problems.push(`Brief.${pair.webKey} is missing from brief.json, or is not a table of strings`);
    continue;
  }
  const found = compare(pair, web);
  problems.push(...found);
  if (found.length === 0) {
    console.log(
      `ok  ${pair.table.padEnd(16)} ${String(Object.keys(pair.core).length).padStart(3)} keys = Brief.${pair.webKey}`,
    );
  }
}

for (const single of SINGLES) {
  const where = `${single.table}["${single.key}"] (${single.source}) vs Brief.${single.webPath}`;
  const coreValue = Object.hasOwn(single.core, single.key) ? single.core[single.key] : undefined;
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
    console.log(`ok  ${single.table}["${single.key}"] = Brief.${single.webPath}`);
  }
}

if (problems.length > 0) {
  console.error(`\n${problems.length} reason string(s) have drifted:\n`);
  for (const problem of problems) console.error(`${problem}\n`);
  console.error("Core and apps/web/messages/en/brief.json must hold byte-identical English.");
  process.exit(1);
}

console.log("\nno drift");
