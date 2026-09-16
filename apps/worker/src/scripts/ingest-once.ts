// Reads one board inline, without pg-boss, and prints the result.
// Usage: pnpm --filter @pemby/worker ingest:once -- <ats> <token> [us|eu]
// Needs DATABASE_URL. A board not yet in `companies` is added as a manual row (source_list null),
// which company sync leaves alone.
import { createAtsHttpClient } from "@pemby/ats";
import { ATS_KINDS, type AtsKind } from "@pemby/core/private-config";
import { createDb, schema } from "@pemby/db";
import { and, eq } from "drizzle-orm";
import { ingestCompanyBoard } from "../ingest/ingest-board";
import { companySlug } from "../ingest/sync-companies";

const { companies } = schema;

const args = process.argv.slice(2).filter((a) => a !== "--");
const [atsArg, token, regionArg = "us"] = args;
if (!atsArg || !token || !(ATS_KINDS as readonly string[]).includes(atsArg)) {
  console.error(`usage: ingest:once -- <${ATS_KINDS.join("|")}> <token> [us|eu]`);
  process.exit(2);
}
if (regionArg !== "us" && regionArg !== "eu") {
  console.error("region must be us or eu");
  process.exit(2);
}
const ats = atsArg as AtsKind;
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const db = createDb(url, { max: 2 });
const controller = new AbortController();
process.on("SIGINT", () => controller.abort(new Error("interrupted")));

try {
  const [existing] = await db
    .select({ id: companies.id, isDemo: companies.isDemo })
    .from(companies)
    .where(and(eq(companies.atsType, ats), eq(companies.atsBoardToken, token)));
  let companyId = existing?.id;
  if (existing?.isDemo) throw new Error("that board belongs to a demo company");
  if (!companyId) {
    const [created] = await db
      .insert(companies)
      .values({
        name: token,
        slug: companySlug(ats, token),
        atsType: ats,
        atsBoardToken: token,
        atsRegion: regionArg,
        ingestEnabled: true,
      })
      .returning({ id: companies.id });
    companyId = created?.id;
    console.log(`added manual company ${companyId}`);
  }
  if (!companyId) throw new Error("company row missing");

  const started = Date.now();
  const result = await ingestCompanyBoard(
    { db, http: createAtsHttpClient(), signal: controller.signal, force: true },
    companyId,
  );
  console.log(JSON.stringify({ ...result, ms: Date.now() - started }, null, 2));
} catch (error) {
  console.error(
    `ingest:once failed: ${error instanceof Error ? `${error.name}: ${error.message}` : "error"}`,
  );
  process.exitCode = 1;
} finally {
  await db.$client.end();
}
