import { consumeRateLimit } from "@/lib/cv/rate-limit";
import { hasFlagged, insertFlag, loadFlagTarget } from "../_lib/db";
import { authorize, fail, isIn, isUuid, json, readJson } from "../_lib/http";
import {
  FLAG_ELIGIBILITY_VALUES,
  FLAG_FIELDS,
  FLAG_REASONS,
  FLAG_SALARY_VALUES,
  FLAG_SENIORITY_VALUES,
  type FlagBody,
  type FlagField,
} from "../_lib/view";

/**
 * Anti-abuse (PLAN section 6): a per-user daily flag limit, on the same fixed-window counter the
 * CV routes use (`lib/cv/rate-limit.ts`, the `rate_limits` table). It is consumed only once a flag
 * is about to be stored — a duplicate flag is refused before the counter is touched — so the limit
 * counts stored flags, which is what "a daily flag limit per user" means.
 */
export const FLAG_USER_LIMIT = { windowSeconds: 24 * 3600, max: 10 } as const;

type Parsed = { ok: true; body: FlagBody } | { ok: false };

/**
 * The fixed value list for one field. `salary`, `seniority` and `eligibility` have closed
 * vocabularies; `stack` and `location` are checked against the post's own listed values, which is
 * the only fixed list those two can have. Everything else is refused, so no typed text can reach
 * `flags.field_value` (PLAN section 6: a fixed picker with no free text).
 */
function allowedValues(
  field: FlagField,
  target: { stack: string[]; locations: string[] },
): readonly string[] {
  switch (field) {
    case "salary":
      return FLAG_SALARY_VALUES;
    case "seniority":
      return FLAG_SENIORITY_VALUES;
    case "eligibility":
      return FLAG_ELIGIBILITY_VALUES;
    case "stack":
      return target.stack;
    case "location":
      return target.locations;
  }
}

function parseShape(body: Record<string, unknown> | null): Parsed {
  if (!body) return { ok: false };
  if (!isUuid(body.jobId) || !isIn(FLAG_REASONS, body.reason)) return { ok: false };
  if (body.reason === "wrong_details") {
    if (!isIn(FLAG_FIELDS, body.field) || typeof body.fieldValue !== "string") return { ok: false };
    return {
      ok: true,
      body: {
        jobId: body.jobId,
        reason: "wrong_details",
        field: body.field,
        fieldValue: body.fieldValue,
      },
    };
  }
  if (body.field !== undefined || body.fieldValue !== undefined) return { ok: false };
  return { ok: true, body: { jobId: body.jobId, reason: body.reason } };
}

/** `POST /api/brief/flag` — the six flag reasons of PLAN D26 and the "wrong details" picker. */
export async function POST(request: Request): Promise<Response> {
  const auth = await authorize(request);
  if (auth.error) return auth.error;
  const userId = auth.session.user.id;

  const parsed = parseShape(await readJson(request));
  if (!parsed.ok) return fail("invalid_request", 400);
  const body = parsed.body;

  const target = await loadFlagTarget(body.jobId);
  if (!target) return fail("job_not_found", 404);
  if (body.field && !allowedValues(body.field, target).includes(body.fieldValue ?? "")) {
    return fail("invalid_request", 400);
  }
  if (await hasFlagged(userId, body.jobId)) return fail("already_flagged", 409);

  const within = await consumeRateLimit(
    `flag:user:${userId}`,
    FLAG_USER_LIMIT.windowSeconds,
    FLAG_USER_LIMIT.max,
  );
  if (!within) return fail("flag_limit_reached", 429);

  const stored = await insertFlag(userId, body);
  if (!stored) return fail("already_flagged", 409);
  return json({ jobId: body.jobId, flagged: true }, 201);
}
