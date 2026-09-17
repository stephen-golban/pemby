// Stable error codes for the CV routes. Bodies are `{ "error": code }`; the client maps codes to
// messages through i18n. No user-facing text here.

export const CV_ERROR_STATUS = {
  not_found: 404,
  unauthenticated: 401,
  cv_too_large: 400,
  cv_bad_type: 400,
  cv_text_length: 400,
  turnstile_failed: 400,
  rate_limited: 429,
  /** Storage, queue or configuration failure; nothing the caller can fix. */
  unavailable: 503,
} as const;

export type CvErrorCode = keyof typeof CV_ERROR_STATUS;

export function cvError(code: CvErrorCode): Response {
  return Response.json(
    { error: code },
    { status: CV_ERROR_STATUS[code], headers: { "Cache-Control": "no-store" } },
  );
}
