// One `embed.profile` run: build the profile's embedding text from the profile row and its parsed
// CV, skip when its hash is unchanged, otherwise one embedding request on the private ZDR key and
// an upsert into `profile_embeddings`.
//
// Privacy: everything this module reads is personal data. It never logs, never returns any of it,
// and the only things a caller can log are the profile id, counts, cost and milliseconds. The
// request goes out on the `profile-embedding` route, which is `personalData: true` on the private
// key, and `withEnforcedZdr` rewrites the body to `provider: { zdr: true, data_collection: "deny" }`.
import { EMBEDDING_MODEL, runEmbeddingTask } from "@pemby/ai";
import { schema, type Db } from "@pemby/db";
import { and, desc, eq, sql } from "drizzle-orm";

import { assertEmbedBudget } from "./budget";
import type { EmbedDeps, EmbedOutcome } from "./embed-job";
import { EMBED_TEXT_VERSION, buildProfileEmbeddingText, embeddingContentHash } from "./text";

const { cvFiles, profileEmbeddings, profiles } = schema;

/** `cv_files.parsed` is `Record<string, unknown>`; read it defensively, never trust its shape. */
function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Records that this run confirmed the vector against the profile row and the newest parsed CV. The
 * job-side twin in `embed-job.ts` carries the full reasoning: raw SQL because `updatedAt` has a
 * drizzle `$onUpdate` hook and `updated_at` means "the vector changed", and a `checked_at` the
 * database itself produced because it is compared with `<`.
 */
async function recordProfileChecked(db: Db, profileId: string, checkedAt: string): Promise<void> {
  await db.execute(sql`
    update profile_embeddings
       set source_key = ${EMBED_TEXT_VERSION},
           checked_at = ${checkedAt}::timestamptz
     where profile_id = ${profileId}
  `);
}

/**
 * Embeds one profile. Throws `DailyCapReachedError` (global cap or the embed sub-budget; nothing
 * was sent), `AiCallError`, `AiEmbeddingInvalidError`, the caller's abort reason, or a database
 * error. Callers sanitize anything they rethrow.
 */
export async function embedProfile(deps: EmbedDeps, profileId: string): Promise<EmbedOutcome> {
  const { db } = deps;
  const [row] = await db
    .select({
      userId: profiles.userId,
      titles: profiles.titles,
      seniority: profiles.seniority,
      yearsExperience: profiles.yearsExperience,
      stack: profiles.stack,
      // The database's clock reading from before the sources were read. Kept as text and cast
      // back on the way in: drizzle's `timestamp` mapper would call `.toISOString()` on it, and the
      // driver returns a raw `now()` as a string.
      checkedAt: sql<string>`now()`,
    })
    .from(profiles)
    .where(eq(profiles.id, profileId))
    .limit(1);
  if (!row) return { kind: "skipped", reason: "not-found" };

  // The most recently parsed CV for this user fills the gaps the onboarding form left, and is the
  // only source of domains (the profile row has no such column).
  const [cv] = await db
    .select({ parsed: cvFiles.parsed })
    .from(cvFiles)
    .where(and(eq(cvFiles.userId, row.userId), eq(cvFiles.parseStatus, "parsed")))
    .orderBy(desc(cvFiles.parsedAt), desc(cvFiles.updatedAt))
    .limit(1);
  const parsed = cv?.parsed ?? {};

  const text = buildProfileEmbeddingText({
    titles: [...row.titles, ...stringList(parsed.titles)],
    seniority: row.seniority ?? stringOrNull(parsed.seniority),
    yearsExperience: row.yearsExperience ?? numberOrNull(parsed.yearsExperience),
    stack: [...row.stack, ...stringList(parsed.stack)],
    domains: stringList(parsed.domains),
  });
  // Nothing to match on yet: onboarding has not run and no CV has been parsed.
  if (text === "") {
    await recordProfileChecked(db, profileId, row.checkedAt);
    return { kind: "skipped", reason: "no-signal" };
  }
  const contentHash = embeddingContentHash(text);

  const [existing] = await db
    .select({ contentHash: profileEmbeddings.contentHash, model: profileEmbeddings.model })
    .from(profileEmbeddings)
    .where(eq(profileEmbeddings.profileId, profileId))
    .limit(1);
  if (existing && existing.contentHash === contentHash && existing.model === EMBEDDING_MODEL) {
    // Same bookkeeping as the job side: no model call, but the check itself has to be recorded or
    // the profile is offered again on every sweep. A profile row is updated for reasons that have
    // nothing to do with the five embedded fields, and each of those armed it for ever.
    await recordProfileChecked(db, profileId, row.checkedAt);
    return { kind: "unchanged" };
  }

  await assertEmbedBudget(db, deps.budgetUsd);
  const result = await runEmbeddingTask({
    task: "profile-embedding",
    values: [text],
    ledger: deps.ledger,
    capGuard: deps.capGuard,
    context: { userId: row.userId, runLabel: deps.runLabel ?? null },
    ...(deps.abortSignal ? { abortSignal: deps.abortSignal } : {}),
  });
  const embedding = result.embeddings[0];
  if (!embedding) return { kind: "skipped", reason: "no-signal" };

  await db
    .insert(profileEmbeddings)
    .values({
      profileId,
      model: EMBEDDING_MODEL,
      contentHash,
      embedding,
      sourceKey: EMBED_TEXT_VERSION,
      checkedAt: sql`${row.checkedAt}::timestamptz`,
    })
    .onConflictDoUpdate({
      target: profileEmbeddings.profileId,
      set: {
        model: EMBEDDING_MODEL,
        contentHash,
        embedding,
        sourceKey: EMBED_TEXT_VERSION,
        checkedAt: sql`${row.checkedAt}::timestamptz`,
        updatedAt: new Date(),
      },
    });

  return {
    kind: "embedded",
    chars: text.length,
    inputTokens: result.inputTokens,
    costUsd: result.costUsd,
    model: result.model,
    requests: result.requests,
    latencyMs: result.latencyMs,
  };
}
