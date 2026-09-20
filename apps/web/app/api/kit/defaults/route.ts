// `PATCH /api/kit/defaults` — the application defaults, asked in context (PLAN D5).
//
// They live under `/api/kit` rather than `/api/profile` because this is where they are asked and
// where they are used: PLAN D5 says company preferences and application defaults are asked later,
// in context, and the context is the first kit. Putting them on the profile route would mean a
// settings page nobody visits holding the answers a kit needs.
//
// Every value is from a closed vocabulary or is a parsed URL. Nothing typed freely is stored,
// because the next place these go is a model prompt.

import { saveApplicationDefaults } from "../_lib/db";
import { authorize, fail, json, readJson } from "../_lib/http";
import {
  MAX_DEFAULT_LINKS,
  MAX_LINK_CHARS,
  NOTICE_PERIODS,
  WORK_AUTH_QUESTIONS,
  type ApplicationDefaultsPatch,
  type NoticePeriod,
  type WorkAuthQuestion,
} from "../_lib/view";

export const dynamic = "force-dynamic";

type Parsed = { ok: true; patch: ApplicationDefaultsPatch } | { ok: false };

function parse(body: Record<string, unknown> | null): Parsed {
  if (!body) return { ok: false };
  const patch: ApplicationDefaultsPatch = {};

  if ("noticePeriod" in body) {
    const value = body.noticePeriod;
    if (value !== null && !isIn(NOTICE_PERIODS, value)) return { ok: false };
    patch.noticePeriod = value as NoticePeriod | null;
  }

  if ("links" in body) {
    const value = body.links;
    if (!Array.isArray(value) || value.length > MAX_DEFAULT_LINKS) return { ok: false };
    const links: string[] = [];
    for (const raw of value) {
      if (typeof raw !== "string") return { ok: false };
      const link = raw.trim();
      if (link.length === 0 || link.length > MAX_LINK_CHARS) return { ok: false };
      // Refused, not silently dropped. A link the reader typed and the server discarded would
      // reappear as an empty row with no explanation, and they would type it again.
      if (!isPublishableUrl(link)) return { ok: false };
      links.push(link);
    }
    patch.links = links;
  }

  if ("workAuthorization" in body) {
    const value = body.workAuthorization;
    if (typeof value !== "object" || value === null || Array.isArray(value)) return { ok: false };
    const answers: Partial<Record<WorkAuthQuestion, boolean>> = {};
    for (const [key, answer] of Object.entries(value as Record<string, unknown>)) {
      if (!isIn(WORK_AUTH_QUESTIONS, key)) return { ok: false };
      if (typeof answer !== "boolean") return { ok: false };
      answers[key] = answer;
    }
    patch.workAuthorization = answers;
  }

  // The explicit "I am done with this form". Only the literal `true` is accepted: there is no
  // un-answering, and a body that tried would be a client this route does not have.
  if ("answered" in body) {
    if (body.answered !== true) return { ok: false };
    patch.answered = true;
  }

  return Object.keys(patch).length > 0 ? { ok: true, patch } : { ok: false };
}

function isIn<T extends string>(list: readonly T[], value: unknown): value is T {
  return typeof value === "string" && (list as readonly string[]).includes(value);
}

function isPublishableUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

/**
 * Saves whichever of the four answers the request carries, and — only when it carries
 * `answered: true` — stamps `answeredAt`.
 *
 * The stamp is what makes "no links and no notice period" a set of answers rather than a person who
 * has never been asked, so the page stops asking after the first time through even when every
 * answer was "nothing to say". It belongs to the person's own "Save and continue", not to a field
 * save: one answer out of four is not an answered form, and treating it as one left the other
 * three unreachable.
 */
export async function PATCH(request: Request): Promise<Response> {
  const auth = await authorize(request);
  if (auth.error) return auth.error;

  const parsed = parse(await readJson(request));
  if (!parsed.ok) return fail("invalid_request");

  const saved = await saveApplicationDefaults(auth.session.user.id, parsed.patch, new Date());
  if (!saved) return fail("no_profile");
  return json(saved);
}
