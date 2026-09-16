// Dedupe of the same job across boards and reposts (phase 04). A job's `dedupe_key` is its
// normalized title plus its sorted normalized locations; jobs that share the key in the same
// company, or in companies with the same domain, are duplicates when their descriptions are at
// least 90% similar (word 5-shingle Jaccard). Seniority words stay in the title: they tell jobs
// apart.
import { schema } from "@pemby/db";
import { and, eq, gte, inArray, isNull, ne, or, sql } from "drizzle-orm";
import type { DbOrTx } from "./db-types";

const { companies, jobs } = schema;

export const DUPLICATE_SIMILARITY = 0.9;
export const SHINGLE_WORDS = 5;
/** A closed job counts as a repost candidate for this long after it closed. */
export const REPOST_WINDOW_DAYS = 30;

/** Lowercase, accents stripped, anything but letters and digits collapsed to one space. */
export function normalizeText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function dedupeKey(title: string, locations: readonly string[]): string {
  const locs = [...new Set(locations.map(normalizeText).filter(Boolean))].sort();
  return `${normalizeText(title)}|${locs.join(";")}`;
}

/** Word shingles of a text. A text shorter than one shingle becomes a single shingle. */
export function shingles(text: string, size = SHINGLE_WORDS): Set<string> {
  const words = normalizeText(text).split(" ").filter(Boolean);
  const out = new Set<string>();
  if (words.length === 0) return out;
  if (words.length < size) {
    out.add(words.join(" "));
    return out;
  }
  for (let i = 0; i + size <= words.length; i++) out.add(words.slice(i, i + size).join(" "));
  return out;
}

export function jaccard(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  let shared = 0;
  for (const s of small) if (large.has(s)) shared++;
  return shared / (a.size + b.size - shared);
}

export interface DedupeResult {
  canonicalId: string;
  mergedIds: string[];
  /** Set when the job matched a quarantined job and was quarantined with it instead. */
  quarantinedBy?: string;
}

/**
 * Looks for duplicates of one job just written (new or changed) and merges the group:
 * canonical = the open job seen first; every other member becomes `merged` and points at it,
 * including a recently closed repost. Jobs already pointing at a newly merged job are re-pointed
 * to the canonical, so chains stay one level deep. A job matching a quarantined job is quarantined
 * too (pointing at it) rather than left open. Cost is O(jobs sharing the key). An advisory lock
 * on the key serializes concurrent board transactions that dedupe the same key.
 */
export async function dedupeJob(db: DbOrTx, jobId: string): Promise<DedupeResult | null> {
  const [self] = await db
    .select({
      id: jobs.id,
      companyId: jobs.companyId,
      status: jobs.status,
      key: jobs.dedupeKey,
      rawText: jobs.rawText,
      firstSeenAt: jobs.firstSeenAt,
      duplicateOf: jobs.duplicateOfJobId,
      isDemo: jobs.isDemo,
      domain: companies.domain,
    })
    .from(jobs)
    .innerJoin(companies, eq(companies.id, jobs.companyId))
    .where(eq(jobs.id, jobId));
  if (!self || self.status !== "open" || !self.key || self.duplicateOf || self.isDemo) return null;

  const selfShingles = shingles(self.rawText);
  if (selfShingles.size === 0) return null;

  await db.execute(sql`select pg_advisory_xact_lock(hashtext(${self.key}))`);

  const sameCompanyOrDomain = self.domain
    ? or(eq(jobs.companyId, self.companyId), eq(companies.domain, self.domain))
    : eq(jobs.companyId, self.companyId);

  const candidates = await db
    .select({
      id: jobs.id,
      status: jobs.status,
      rawText: jobs.rawText,
      firstSeenAt: jobs.firstSeenAt,
    })
    .from(jobs)
    .innerJoin(companies, eq(companies.id, jobs.companyId))
    .where(
      and(
        eq(jobs.dedupeKey, self.key),
        ne(jobs.id, self.id),
        eq(jobs.isDemo, false),
        isNull(jobs.duplicateOfJobId),
        or(
          eq(jobs.status, "open"),
          eq(jobs.status, "quarantined"),
          and(
            eq(jobs.status, "closed"),
            gte(jobs.closedAt, sql`now() - make_interval(days => ${REPOST_WINDOW_DAYS})`),
          ),
        ),
        sameCompanyOrDomain,
      ),
    );

  const matches = candidates.filter(
    (c) => jaccard(selfShingles, shingles(c.rawText)) >= DUPLICATE_SIMILARITY,
  );
  if (matches.length === 0) return null;

  const quarantined = matches.find((m) => m.status === "quarantined");
  if (quarantined) {
    await db
      .update(jobs)
      .set({ status: "quarantined", duplicateOfJobId: quarantined.id })
      .where(and(eq(jobs.id, self.id), eq(jobs.status, "open")));
    return { canonicalId: quarantined.id, mergedIds: [], quarantinedBy: quarantined.id };
  }

  const group = [{ id: self.id, status: self.status, firstSeenAt: self.firstSeenAt }, ...matches];
  // Only open and closed jobs remain in the group here.
  const canonical = group
    .filter((j) => j.status === "open")
    .sort((a, b) => a.firstSeenAt.getTime() - b.firstSeenAt.getTime() || a.id.localeCompare(b.id))
    .at(0);
  // Self is open, so there is always one.
  if (!canonical) return null;

  const mergedIds = group.filter((j) => j.id !== canonical.id).map((j) => j.id);
  await db
    .update(jobs)
    .set({ status: "merged", duplicateOfJobId: canonical.id })
    .where(inArray(jobs.id, mergedIds));
  await db
    .update(jobs)
    .set({ duplicateOfJobId: canonical.id })
    .where(inArray(jobs.duplicateOfJobId, mergedIds));

  return { canonicalId: canonical.id, mergedIds };
}
