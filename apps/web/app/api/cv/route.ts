// POST /api/cv: multipart `{ file }` with the Turnstile token in the `x-turnstile-token` header
// → 201 `{ cvId }` (phase 06 contract, step 2).
import { createHash } from "node:crypto";
import { putCvObject, cvBucketKey, deleteCvObject } from "@/lib/cv/bucket";
import { cvError } from "@/lib/cv/errors";
import { CV_MAX_BYTES, sniffCvType } from "@/lib/cv/sniff";
import { TURNSTILE_ACTIONS } from "@/lib/cv/turnstile";
import {
  authorizeCvCaller,
  checkHumanAndLimits,
  insertCv,
  markEnqueueFailed,
  newCvId,
} from "@/lib/cv/submit";
import { CV_EXTRACT_QUEUE, sendJob } from "@/lib/queue";

/** Room for the multipart boundary and part headers around a 5 MB file. */
const MULTIPART_OVERHEAD_BYTES = 64 * 1024;

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : "error";
}

export async function POST(request: Request): Promise<Response> {
  const caller = await authorizeCvCaller(request);
  if (caller instanceof Response) return caller;

  // Before reading the body. A request without Content-Length (chunked) is refused too: the body
  // would be buffered unbounded.
  const declared = Number(request.headers.get("content-length"));
  if (
    !Number.isFinite(declared) ||
    declared <= 0 ||
    declared > CV_MAX_BYTES + MULTIPART_OVERHEAD_BYTES
  ) {
    return cvError("cv_too_large");
  }

  // Turnstile and the limits before the body is read: `formData()` buffers the whole upload in
  // memory, so an unsolved or rate-limited caller must never reach it. The token is a header.
  const rejected = await checkHumanAndLimits(request, caller, TURNSTILE_ACTIONS.upload);
  if (rejected) return rejected;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return cvError("cv_bad_type");
  }
  const file = form.get("file");

  if (!(file instanceof File) || file.size === 0) return cvError("cv_bad_type");
  if (file.size > CV_MAX_BYTES) return cvError("cv_too_large");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.byteLength > CV_MAX_BYTES) return cvError("cv_too_large");
  const type = sniffCvType(bytes);
  if (!type) return cvError("cv_bad_type");

  const userId = caller.session.user.id;
  const cvId = newCvId();
  const key = cvBucketKey(userId, cvId);
  const sha256 = createHash("sha256").update(bytes).digest("hex");

  try {
    await putCvObject(key, bytes, type.mime);
  } catch (error) {
    console.error(`cv upload: bucket put failed cv=${cvId} err=${errorName(error)}`);
    return cvError("unavailable");
  }

  let inserted: boolean;
  try {
    inserted = await insertCv(caller.session, cvId, {
      source: "file",
      bucketKey: key,
      // Generic name only: uploaded file names often contain the person's full name.
      fileName: type.fileName,
      mimeType: type.mime,
      sizeBytes: bytes.byteLength,
      sha256,
      extractedText: null,
      parseStatus: "uploaded",
    });
  } catch (error) {
    console.error(`cv upload: insert failed cv=${cvId} err=${errorName(error)}`);
    await deleteCvObject(key).catch(() => undefined);
    return cvError("unavailable");
  }
  if (!inserted) {
    await deleteCvObject(key).catch(() => undefined);
    return cvError("unauthenticated");
  }

  try {
    await sendJob(CV_EXTRACT_QUEUE, { cvId });
  } catch (error) {
    console.error(`cv upload: enqueue failed cv=${cvId} err=${errorName(error)}`);
    await markEnqueueFailed(cvId).catch(() => undefined);
    return cvError("unavailable");
  }

  console.log(`cv upload: cv=${cvId} type=${type.kind} bytes=${bytes.byteLength}`);
  return Response.json({ cvId }, { status: 201, headers: { "Cache-Control": "no-store" } });
}
