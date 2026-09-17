// Checks and writes shared by POST /api/cv (file) and POST /api/cv/text (pasted text).
// Raw SQL on the shared pool, as in lib/auth/claim.ts (no drizzle-orm operators in apps/web).
import { randomUUID } from "node:crypto";
import { getDb, type CvSource, type CvStageTimings } from "@pemby/db";
import { getSession, type Session } from "@/lib/auth/session";
import { deleteCvObject } from "./bucket";
import { clientIp } from "./client-ip";
import { cvError } from "./errors";
import { cvAnonTtlHours, cvDropEnabled } from "./feature";
import { consumeCvLimits } from "./rate-limit";
import { verifyTurnstile, type TurnstileAction } from "./turnstile";

export type CvCaller = { session: Session; ip: string | null };

/** Contract steps: feature on, then a session (anonymous or real). */
export async function authorizeCvCaller(request: Request): Promise<CvCaller | Response> {
  if (!cvDropEnabled()) return cvError("not_found");
  const session = await getSession(request.headers);
  if (!session) return cvError("unauthenticated");
  return { session, ip: clientIp(request.headers) };
}

/**
 * Turnstile first (cheap bot reject), then the rate-limit counters. Both run before the request
 * body is read, so an unsolved or rate-limited caller never gets 5 MB buffered on their behalf.
 * The token travels in the `x-turnstile-token` header for exactly that reason.
 */
export async function checkHumanAndLimits(
  request: Request,
  caller: CvCaller,
  action: TurnstileAction,
): Promise<Response | null> {
  const turnstile = await verifyTurnstile(
    request.headers.get("x-turnstile-token"),
    caller.ip,
    action,
  );
  if (turnstile === "misconfigured") {
    console.error("cv: TURNSTILE_SECRET_KEY is not set");
    return cvError("unavailable");
  }
  if (turnstile !== "ok") return cvError("turnstile_failed");
  const anonymous = caller.session.user.isAnonymous === true;
  if (!(await consumeCvLimits(caller.ip, caller.session.user.id, anonymous))) {
    return cvError("rate_limited");
  }
  return null;
}

export function newCvId(): string {
  return randomUUID();
}

export type CvInsert = {
  source: CvSource;
  bucketKey: string | null;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  extractedText: string | null;
  parseStatus: "uploaded" | "parsing";
};

/**
 * Inserts the new `cv_files` row. For an anonymous user, first removes every earlier CV (bucket
 * object, then row) so only one stays active, and sets `expires_at`. The user row is locked for
 * the transaction so concurrent uploads, the claim and the cleanup job serialize. Returns false
 * when the user no longer exists (claimed or cleaned up meanwhile).
 */
export async function insertCv(session: Session, cvId: string, input: CvInsert): Promise<boolean> {
  const userId = session.user.id;
  const anonymous = session.user.isAnonymous === true;
  const now = new Date().toISOString();
  const timings: CvStageTimings = { uploadedAt: now };
  if (input.source === "text") timings.extractedAt = now;

  const client = await getDb().$client.connect();
  try {
    await client.query("begin");
    const locked = await client.query(`select id from "user" where id = $1 for update`, [userId]);
    if (locked.rowCount === 0) {
      await client.query("rollback");
      return false;
    }

    if (anonymous) {
      const previous = await client.query<{ bucket_key: string | null }>(
        "select bucket_key from cv_files where user_id = $1 for update",
        [userId],
      );
      // Objects first: if a delete fails the transaction rolls back and the rows still point at
      // what is left, so the cleanup job can finish the job later.
      for (const row of previous.rows) if (row.bucket_key) await deleteCvObject(row.bucket_key);
      if (previous.rows.length > 0) {
        await client.query("delete from cv_files where user_id = $1", [userId]);
      }
    }

    await client.query(
      `insert into cv_files (id, user_id, source, bucket_key, file_name, mime_type, size_bytes,
                             sha256, extracted_text, parse_status, stage_timings, expires_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb,
               case when $12::boolean then now() + make_interval(hours => $13::int) end)`,
      [
        cvId,
        userId,
        input.source,
        input.bucketKey,
        input.fileName,
        input.mimeType,
        input.sizeBytes,
        input.sha256,
        input.extractedText,
        input.parseStatus,
        JSON.stringify(timings),
        anonymous,
        cvAnonTtlHours(),
      ],
    );
    await client.query("commit");
    return true;
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/** Marks a row whose job could not be queued, so the client stops polling. */
export async function markEnqueueFailed(cvId: string): Promise<void> {
  await getDb().$client.query(
    `update cv_files set parse_status = 'failed', error_code = 'enqueue_failed', updated_at = now()
      where id = $1`,
    [cvId],
  );
}
