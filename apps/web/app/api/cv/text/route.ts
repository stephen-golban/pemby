// POST /api/cv/text: JSON `{ text }` with the Turnstile token in the `x-turnstile-token` header
// → 201 `{ cvId }` (phase 06 contract, step 3).
import { createHash } from "node:crypto";
import { cvError } from "@/lib/cv/errors";
import {
  authorizeCvCaller,
  checkHumanAndLimits,
  insertCv,
  markEnqueueFailed,
  newCvId,
} from "@/lib/cv/submit";
import { TURNSTILE_ACTIONS } from "@/lib/cv/turnstile";
import { CV_PARSE_QUEUE, sendJob } from "@/lib/queue";

const CV_TEXT_MIN_CHARS = 200;
const CV_TEXT_MAX_CHARS = 30_000;
/** 30,000 characters of up to 4 UTF-8 bytes each, plus JSON framing. */
const BODY_MAX_BYTES = CV_TEXT_MAX_CHARS * 4 + 16 * 1024;

/**
 * Same normalization as the extract job: NFC, C0 controls dropped (Postgres refuses U+0000),
 * spaces collapsed per line, at most one blank line.
 */
function normalizeText(raw: string): string {
  return (
    raw
      .normalize("NFC")
      .replace(/\r\n?/g, "\n")
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
      .split("\n")
      .map((line) => line.replace(/[^\S\n]+/g, " ").trim())
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : "error";
}

export async function POST(request: Request): Promise<Response> {
  const caller = await authorizeCvCaller(request);
  if (caller instanceof Response) return caller;

  const declared = Number(request.headers.get("content-length"));
  if (!Number.isFinite(declared) || declared <= 0 || declared > BODY_MAX_BYTES) {
    return cvError("cv_too_large");
  }
  // Turnstile and the limits before the body is read, as in POST /api/cv. The token is a header.
  const rejected = await checkHumanAndLimits(request, caller, TURNSTILE_ACTIONS.text);
  if (rejected) return rejected;

  const input: unknown = await request.json().catch(() => null);
  const record = input && typeof input === "object" ? (input as Record<string, unknown>) : {};

  if (typeof record.text !== "string") return cvError("cv_text_length");
  const text = normalizeText(record.text);
  if (text.length < CV_TEXT_MIN_CHARS) return cvError("cv_text_length");
  if (text.length > CV_TEXT_MAX_CHARS) return cvError("cv_too_large");

  const cvId = newCvId();
  let inserted: boolean;
  try {
    inserted = await insertCv(caller.session, cvId, {
      source: "text",
      bucketKey: null,
      fileName: "cv.txt",
      mimeType: "text/plain",
      sizeBytes: Buffer.byteLength(text, "utf8"),
      sha256: createHash("sha256").update(text).digest("hex"),
      extractedText: text,
      parseStatus: "parsing",
    });
  } catch (error) {
    console.error(`cv text: insert failed cv=${cvId} err=${errorName(error)}`);
    return cvError("unavailable");
  }
  if (!inserted) return cvError("unauthenticated");

  try {
    await sendJob(CV_PARSE_QUEUE, { cvId });
  } catch (error) {
    console.error(`cv text: enqueue failed cv=${cvId} err=${errorName(error)}`);
    await markEnqueueFailed(cvId).catch(() => undefined);
    return cvError("unavailable");
  }

  console.log(`cv text: cv=${cvId} chars=${text.length}`);
  return Response.json({ cvId }, { status: 201, headers: { "Cache-Control": "no-store" } });
}
