// Keeps `companies` in step with the private source lists (PLAN D23). Boards in a list are
// upserted and enabled; list-sourced boards that left every list are disabled and their open jobs
// closed. Demo rows and boards added by hand (source_list null) are never touched.
import { createHash } from "node:crypto";
import { loadPrivateConfig, type SourceEntry } from "@pemby/core/private-config";
import { schema, type Db } from "@pemby/db";
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";

const { companies, jobs } = schema;

export interface SyncCompaniesResult {
  listsRead: number;
  entries: number;
  upserted: number;
  disabled: number;
  jobsClosed: number;
  skipped: boolean;
  /** `version.id` of the private config this sync read. */
  configId: string;
  /** Why the disable step did not run, when it did not. */
  disableSkipped?: string;
}

/** Refuse to disable more than this share of enabled list-sourced boards in one sync. */
const MAX_DISABLE_SHARE = 0.2;

// ATS kinds never contain "|", so the key is unambiguous.
const boardKey = (ats: string, token: string) => `${ats}|${token}`;

/**
 * `${ats}-${token}`, lowercased, anything but a-z, 0-9 and "-" replaced. When that changes the
 * token (case, dots, spaces), a short hash of the raw pair keeps slugs of distinct boards apart.
 */
export function companySlug(ats: string, token: string): string {
  const raw = `${ats}-${token}`;
  const clean = raw
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/-$/, "");
  if (clean === raw) return clean;
  return `${clean}-${createHash("sha256").update(raw).digest("hex").slice(0, 8)}`;
}

export async function syncCompanies(
  db: Db,
  listNames: readonly string[],
): Promise<SyncCompaniesResult> {
  const { sourceLists, version } = await loadPrivateConfig();

  // Later lists do not override earlier ones: the first list naming a board owns it.
  const wanted = new Map<string, { entry: SourceEntry; list: string }>();
  let listsRead = 0;
  for (const name of listNames) {
    const list = sourceLists.get(name);
    if (!list) continue;
    listsRead++;
    for (const entry of list.entries) {
      const key = boardKey(entry.ats, entry.boardToken);
      if (!wanted.has(key)) wanted.set(key, { entry, list: name });
    }
  }

  const result: SyncCompaniesResult = {
    listsRead,
    entries: wanted.size,
    upserted: 0,
    disabled: 0,
    jobsClosed: 0,
    skipped: false,
    configId: version.id,
  };

  // A missing or empty list is far more likely a config mistake than every board going away, so
  // it disables nothing.
  if (listsRead === 0 || wanted.size === 0) {
    result.skipped = true;
    return result;
  }

  await db.transaction(async (tx) => {
    const values = [...wanted.values()].map(({ entry, list }) => ({
      name: entry.companyName ?? entry.boardToken,
      slug: companySlug(entry.ats, entry.boardToken),
      domain: entry.domain ?? null,
      atsType: entry.ats,
      atsBoardToken: entry.boardToken,
      atsRegion: entry.region ?? "us",
      ingestEnabled: true,
      sourceList: list,
    }));

    for (let i = 0; i < values.length; i += 500) {
      const chunk = values.slice(i, i + 500);
      const rows = await tx
        .insert(companies)
        .values(chunk)
        .onConflictDoUpdate({
          target: [companies.atsType, companies.atsBoardToken],
          set: {
            name: sql`excluded.name`,
            domain: sql`coalesce(excluded.domain, ${companies.domain})`,
            atsRegion: sql`excluded.ats_region`,
            ingestEnabled: true,
            sourceList: sql`excluded.source_list`,
            updatedAt: sql`now()`,
          },
          setWhere: eq(companies.isDemo, false),
        })
        .returning({ id: companies.id });
      result.upserted += rows.length;
    }

    const listed = await tx
      .select({ id: companies.id, ats: companies.atsType, token: companies.atsBoardToken })
      .from(companies)
      .where(
        and(
          eq(companies.isDemo, false),
          eq(companies.ingestEnabled, true),
          isNotNull(companies.sourceList),
          isNotNull(companies.atsType),
          isNotNull(companies.atsBoardToken),
        ),
      );
    // Disable only against the full picture: every configured list loaded, and not a mass drop
    // (more likely a truncated or mistaken list than a fifth of all boards going away at once).
    if (listsRead < listNames.length) {
      result.disableSkipped = `only ${listsRead} of ${listNames.length} source lists loaded`;
      return;
    }
    const gone = listed
      .filter((c) => !wanted.has(boardKey(c.ats ?? "", c.token ?? "")))
      .map((c) => c.id);
    if (gone.length > MAX_DISABLE_SHARE * listed.length) {
      result.disableSkipped = `${gone.length} of ${listed.length} enabled boards left the lists (over ${MAX_DISABLE_SHARE * 100}%)`;
      return;
    }

    for (let i = 0; i < gone.length; i += 500) {
      const ids = gone.slice(i, i + 500);
      const disabled = await tx
        .update(companies)
        .set({ ingestEnabled: false })
        .where(inArray(companies.id, ids))
        .returning({ id: companies.id });
      result.disabled += disabled.length;
      const closed = await tx
        .update(jobs)
        .set({ status: "closed", closedAt: sql`now()` })
        .where(and(inArray(jobs.companyId, ids), eq(jobs.status, "open"), eq(jobs.isDemo, false)))
        .returning({ id: jobs.id });
      result.jobsClosed += closed.length;
    }
  });

  return result;
}
