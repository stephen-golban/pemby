// Runs the rules extractor and the eligibility engine over a sample of open jobs and prints the
// tier per country and way of working. Read-only: the session is set to read-only transactions
// before any query. Prints titles and reason keys, never description text.
//
// Usage: DATABASE_URL=... pnpm --filter @pemby/core engine:sample [--limit 20] [--seed x] [--remote]
//        [--countries MD,UA,GE]
// Staging: RAILWAY_SERVICE=worker scripts/dev-staging.sh pnpm --filter @pemby/core engine:sample
import pg from "pg";
import {
  ENGINE_VERSION,
  decideEligibility,
  extractRuleSignals,
  type EligibilityTier,
  type WayOfWorking,
} from "../src";

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const limit = Math.min(Number(arg("limit") ?? 20), 500);
const seed = arg("seed") ?? "pemby";
const remoteOnly = process.argv.includes("--remote");
const countries = (arg("countries") ?? "MD,UA,GE").split(",").map((c) => c.trim().toUpperCase());
const ways: WayOfWorking[] = ["b2b-contractor", "eor-employee"];
const WAY_SHORT: Record<string, string> = { "b2b-contractor": "B2B", "eor-employee": "EOR" };

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
    locations: string[];
    workplace_type: string | null;
    employment_type: string | null;
    raw_text: string;
    url: string;
  }>(
    `select title, locations, workplace_type, employment_type, raw_text, url
       from jobs
      where status = 'open' and is_demo = false
        and ($2::boolean = false or workplace_type = 'remote')
      order by md5(id::text || $1)
      limit $3`,
    [seed, remoteOnly, limit],
  );

  const tiers = new Map<string, Record<EligibilityTier, number>>();
  const keys = new Map<string, number>();
  console.log(`engine ${ENGINE_VERSION}; countries ${countries.join(",")}`);
  for (const row of rows) {
    const rules = extractRuleSignals({
      title: row.title,
      locations: row.locations,
      workplaceType: row.workplace_type,
      employmentType: row.employment_type,
      descriptionText: row.raw_text,
    });
    const verdicts = decideEligibility({ rules, countries, ways, postUrl: row.url });
    const cells: string[] = [];
    for (const v of verdicts) {
      const pair = `${v.country} ${WAY_SHORT[v.wayOfWorking]}`;
      const counts = tiers.get(pair) ?? { green: 0, yellow: 0, white: 0, red: 0 };
      counts[v.tier] += 1;
      tiers.set(pair, counts);
      keys.set(v.reasonKey, (keys.get(v.reasonKey) ?? 0) + 1);
      cells.push(`${pair}=${v.tier}(${v.reasonKey})`);
    }
    console.log(
      `- ${row.title.slice(0, 60)} | ${row.locations.join("; ").slice(0, 60)} | ${row.workplace_type ?? "?"}`,
    );
    console.log(`    ${cells.join("  ")}`);
  }
  console.log(`\njobs: ${rows.length}`);
  console.log("tier distribution        green yellow  white    red");
  for (const [pair, c] of tiers) {
    console.log(
      `  ${pair.padEnd(22)} ${String(c.green).padStart(5)} ${String(c.yellow).padStart(6)} ${String(c.white).padStart(6)} ${String(c.red).padStart(6)}`,
    );
  }
  console.log(`reason keys: ${[...keys].map(([k, n]) => `${k}=${n}`).join(", ")}`);
} finally {
  await client.end();
}
