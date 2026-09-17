// Runs the deterministic eligibility rules over a sample of open jobs and prints the signals.
// Read-only: the session is set to read-only transactions before any query. Prints titles,
// location strings and compact signals, never description text (evidence spans only with --evidence).
//
// Usage: DATABASE_URL=... pnpm --filter @pemby/core rules:sample [--limit 30] [--seed x] [--remote]
//        [--evidence]
// Staging: RAILWAY_SERVICE=worker scripts/dev-staging.sh pnpm --filter @pemby/core rules:sample
import pg from "pg";
import { extractRuleSignals, type EligibilitySignal } from "../src/eligibility";

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const limit = Math.min(Number(arg("limit") ?? 30), 500);
const seed = arg("seed") ?? "pemby";
const remoteOnly = process.argv.includes("--remote");
const showEvidence = process.argv.includes("--evidence");

function compact(signal: EligibilitySignal): string {
  const places = [...signal.scopes.countries, ...signal.scopes.regions].join(",");
  const parts = [`${signal.kind}${places ? `[${places}]` : ""}`];
  if (signal.anchor) parts.push(signal.anchor.workplace);
  if (signal.engagement) {
    parts.push(
      signal.engagement.mode + (signal.engagement.provider ? `:${signal.engagement.provider}` : ""),
    );
  }
  if (signal.requirement) parts.push(signal.requirement);
  if (signal.timezone) {
    const ranges = signal.timezone.ranges.map((r) => `${r.minOffset}..${r.maxOffset}`).join("|");
    parts.push(`${signal.timezone.mode}(${ranges || "?"})`);
  }
  const source = signal.source === "rules" ? "" : `${signal.source}:`;
  return `${source}${parts.join(" ")}/${signal.strength[0]}`;
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query("SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY");
  const { rows } = await client.query<{
    title: string;
    location_text: string | null;
    locations: string[];
    workplace_type: string | null;
    employment_type: string | null;
    raw_text: string;
  }>(
    `select title, location_text, locations, workplace_type, employment_type, raw_text
       from jobs
      where status = 'open' and is_demo = false
        and ($2::boolean = false or workplace_type = 'remote')
      order by md5(id::text || $1)
      limit $3`,
    [seed, remoteOnly, limit],
  );

  let decisive = 0;
  const reasons = new Map<string, number>();
  const kinds = new Map<string, number>();
  for (const row of rows) {
    const result = extractRuleSignals({
      title: row.title,
      locations: row.locations,
      workplaceType: row.workplace_type,
      employmentType: row.employment_type,
      descriptionText: row.raw_text,
    });
    if (!result.unresolved) decisive += 1;
    for (const reason of result.unresolvedReasons) {
      const key = reason.split(":")[0] ?? reason;
      reasons.set(key, (reasons.get(key) ?? 0) + 1);
    }
    for (const signal of result.signals) {
      kinds.set(signal.kind, (kinds.get(signal.kind) ?? 0) + 1);
    }
    const status = result.unresolved
      ? `UNRESOLVED(${result.unresolvedReasons.join(",")})`
      : "SETTLED";
    console.log(
      `- ${row.title.slice(0, 60)} | ${(row.location_text ?? "").slice(0, 70)} | ${row.workplace_type ?? "?"}`,
    );
    console.log(`    ${status}  ${result.signals.map(compact).join("  ") || "(no signals)"}`);
    if (showEvidence) {
      for (const signal of result.signals.filter((s) => s.evidence.field !== "locations")) {
        console.log(`      > ${signal.kind}: ${signal.evidence.text.slice(0, 120)}`);
      }
    }
  }
  console.log(
    `\njobs: ${rows.length}, settled by rules: ${decisive}, unresolved: ${rows.length - decisive}`,
  );
  console.log(
    `unresolved reasons: ${[...reasons].map(([k, v]) => `${k}=${v}`).join(", ") || "none"}`,
  );
  console.log(`signal kinds: ${[...kinds].map(([k, v]) => `${k}=${v}`).join(", ")}`);
} finally {
  await client.end();
}
