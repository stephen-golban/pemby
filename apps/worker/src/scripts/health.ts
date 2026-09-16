// Prints source health per board, totals, and open PLAN D10 jobs per role family and ATS.
// Usage: pnpm --filter @pemby/worker health   (needs DATABASE_URL)
import { countOpenJobsByRoleFamily, createDb, getSourceHealth } from "@pemby/db";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const db = createDb(url, { max: 2 });
const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 16).replace("T", " ") : "-");

try {
  const [health, families] = await Promise.all([
    getSourceHealth(db),
    countOpenJobsByRoleFamily(db),
  ]);

  console.table(
    health.rows.map((r) => ({
      company: r.companyName.slice(0, 28),
      ats: r.ats,
      token: r.boardToken.slice(0, 28),
      region: r.region,
      enabled: r.ingestEnabled,
      status: r.boardStatus ?? "unread",
      lastSuccess: iso(r.lastSuccessAt),
      lastError: r.lastErrorKind ?? "-",
      errs: r.consecutiveErrors,
      runs: r.totalRuns,
      listed: r.jobsListed,
      kept: r.jobsKept,
      open: r.jobsOpen,
    })),
  );
  console.log("totals", health.totals);

  const byFamily = new Map<string, number>();
  const byAts = new Map<string, number>();
  for (const row of families) {
    byFamily.set(row.roleFamily, (byFamily.get(row.roleFamily) ?? 0) + row.open);
    byAts.set(row.ats, (byAts.get(row.ats) ?? 0) + row.open);
  }
  console.log("open D10 jobs per role family");
  console.table(
    [...byFamily].sort((a, b) => b[1] - a[1]).map(([roleFamily, open]) => ({ roleFamily, open })),
  );
  console.log("open D10 jobs per ATS");
  console.table([...byAts].sort((a, b) => b[1] - a[1]).map(([ats, open]) => ({ ats, open })));
} finally {
  await db.$client.end();
}
