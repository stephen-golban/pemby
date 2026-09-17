// GET /api/cv/:id: status of the caller's own CV (phase 06 contract, step 6). Anyone else's id,
// or an id that does not exist, is 404.
import { getDb, type CvStageTimings } from "@pemby/db";
import { getAuth } from "@/lib/auth/server";
import { deleteCvObject } from "@/lib/cv/bucket";
import type { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { cvError } from "@/lib/cv/errors";
import { cvDropEnabled } from "@/lib/cv/feature";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Row = {
  id: string;
  status: string;
  source: string;
  parsed: unknown;
  parsed_partial: unknown;
  error_code: string | null;
  queued_until: Date | null;
  stage_timings: CvStageTimings | null;
};

export async function GET(request: NextRequest, ctx: RouteContext<"/api/cv/[id]">) {
  if (!cvDropEnabled()) return cvError("not_found");
  const session = await getSession(request.headers);
  if (!session) return cvError("unauthenticated");

  const { id } = await ctx.params;
  if (!UUID.test(id)) return cvError("not_found");

  // Raw SQL, as in lib/auth/claim.ts. The owner condition is part of the query: another user's
  // row is never read.
  const { rows } = await getDb().$client.query<Row>(
    `select id, parse_status as status, source, parsed, parsed_partial, error_code, queued_until,
            stage_timings
       from cv_files
      where id = $1 and user_id = $2`,
    [id, session.user.id],
  );
  const row = rows[0];
  if (!row) return cvError("not_found");

  const done = row.status === "parsed";
  return Response.json(
    {
      id: row.id,
      status: row.status,
      source: row.source,
      partial: done ? null : (row.parsed_partial ?? null),
      parsed: done ? (row.parsed ?? null) : null,
      errorCode: row.error_code,
      queuedUntil: row.queued_until?.toISOString() ?? null,
      timings: row.stage_timings ?? {},
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

/**
 * DELETE /api/cv/:id: the owner removes their CV before it expires (PLAN D4 privacy). Deletes the
 * bucket object, then the row; when the caller is anonymous and this was their only CV, the
 * anonymous user goes too (sessions, profiles and pending claims cascade) and the session cookies
 * are cleared. 204 either way; anyone else's id is 404.
 */
export async function DELETE(request: NextRequest, ctx: RouteContext<"/api/cv/[id]">) {
  if (!cvDropEnabled()) return cvError("not_found");
  const session = await getSession(request.headers);
  if (!session) return cvError("unauthenticated");

  const { id } = await ctx.params;
  if (!UUID.test(id)) return cvError("not_found");

  const userId = session.user.id;
  const anonymous = session.user.isAnonymous === true;
  const client = await getDb().$client.connect();
  let userDeleted = false;
  try {
    await client.query("begin");
    // Locking the user row serializes this against an upload, a claim and the cleanup job.
    const locked = await client.query(`select id from "user" where id = $1 for update`, [userId]);
    if (locked.rowCount === 0) {
      await client.query("rollback");
      return cvError("not_found");
    }
    const owned = await client.query<{ bucket_key: string | null }>(
      "select bucket_key from cv_files where id = $1 and user_id = $2 for update",
      [id, userId],
    );
    const row = owned.rows[0];
    if (!row) {
      await client.query("rollback");
      return cvError("not_found");
    }
    // Object first: a failure here rolls back and leaves the row, so the cleanup job retries.
    if (row.bucket_key) await deleteCvObject(row.bucket_key);
    await client.query("delete from cv_files where id = $1 and user_id = $2", [id, userId]);
    if (anonymous) {
      const remaining = await client.query("select 1 from cv_files where user_id = $1", [userId]);
      if (remaining.rowCount === 0) {
        await client.query(`delete from "user" where id = $1 and is_anonymous`, [userId]);
        userDeleted = true;
      }
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    console.error(
      `cv delete: failed cv=${id} err=${error instanceof Error ? error.name : "error"}`,
    );
    return cvError("unavailable");
  } finally {
    client.release();
  }

  const headers = new Headers({ "Cache-Control": "no-store" });
  if (userDeleted) {
    const { authCookies } = await getAuth().$context;
    for (const cookie of [authCookies.sessionToken, authCookies.sessionData]) {
      headers.append("Set-Cookie", `${cookie.name}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`);
    }
  }
  console.log(`cv delete: cv=${id} userDeleted=${userDeleted}`);
  return new Response(null, { status: 204, headers });
}
