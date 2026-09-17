// Browser side of the CV routes (docs/phases/06-contract.md, flow steps 2, 3, 6, 7). Errors carry
// the route's stable code; components map codes to messages through i18n.
import type { ParsedProfile, ParsedProfilePartial } from "@pemby/core";
import type { TeaserResult } from "@/lib/teaser";

/** Codes from `lib/cv/errors.ts`, plus `network` for a request that never got an answer. */
export const CV_CLIENT_ERRORS = [
  "cv_too_large",
  "cv_bad_type",
  "cv_text_length",
  "turnstile_failed",
  "rate_limited",
  "unauthenticated",
  "unavailable",
  "not_found",
  "network",
] as const;
export type CvClientError = (typeof CV_CLIENT_ERRORS)[number];

export class CvRequestError extends Error {
  constructor(
    readonly code: CvClientError,
    readonly status: number,
  ) {
    super(code);
    this.name = "CvRequestError";
  }
}

export const CV_POLL_STATUSES = ["uploaded", "extracting", "parsing", "queued"] as const;
export type CvStatus = (typeof CV_POLL_STATUSES)[number] | "parsed" | "unreadable" | "failed";

export type CvStatusResponse = {
  id: string;
  status: CvStatus;
  source: "file" | "text";
  partial: ParsedProfilePartial | null;
  parsed: ParsedProfile | null;
  errorCode: string | null;
  queuedUntil: string | null;
};

/** `unreadable` error codes: a scan with no text layer, or a file the extractor gave up on. */
export const UNREADABLE_CODES = ["scanned_or_empty", "file_too_complex"] as const;

export function isPolling(status: CvStatus | undefined): boolean {
  return status === undefined || (CV_POLL_STATUSES as readonly string[]).includes(status);
}

function toCode(value: unknown, status: number): CvClientError {
  if (typeof value === "string" && (CV_CLIENT_ERRORS as readonly string[]).includes(value)) {
    return value as CvClientError;
  }
  if (status === 401) return "unauthenticated";
  if (status === 404) return "not_found";
  if (status === 429) return "rate_limited";
  return "unavailable";
}

async function send(input: string, init?: RequestInit): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(input, { ...init, cache: "no-store", credentials: "same-origin" });
  } catch {
    throw new CvRequestError("network", 0);
  }
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const error = body && typeof body === "object" ? (body as { error?: unknown }).error : null;
    throw new CvRequestError(toCode(error, response.status), response.status);
  }
  return response;
}

async function request<T>(input: string, init?: RequestInit): Promise<T> {
  return (await (await send(input, init)).json()) as T;
}

/** The Turnstile token travels in a header, never in the body (phase 06 security review). */
const TOKEN_HEADER = "x-turnstile-token";

/** The file goes up under a generic name: the user's own file name never leaves the browser. */
export function postCvFile(file: File, turnstileToken: string): Promise<{ cvId: string }> {
  const form = new FormData();
  const name = file.name.toLowerCase().endsWith(".docx") ? "cv.docx" : "cv.pdf";
  form.append("file", new File([file], name, { type: file.type }));
  return request("/api/cv", {
    method: "POST",
    headers: { [TOKEN_HEADER]: turnstileToken },
    body: form,
  });
}

export function postCvText(text: string, turnstileToken: string): Promise<{ cvId: string }> {
  return request("/api/cv/text", {
    method: "POST",
    headers: { "Content-Type": "application/json", [TOKEN_HEADER]: turnstileToken },
    body: JSON.stringify({ text }),
  });
}

/** Deletes the caller's own CV now, before the 24-hour cleanup. 204, no body. */
export async function deleteCv(cvId: string): Promise<void> {
  await send(`/api/cv/${encodeURIComponent(cvId)}`, { method: "DELETE" });
}

export function getCv(cvId: string): Promise<CvStatusResponse> {
  return request(`/api/cv/${encodeURIComponent(cvId)}`);
}

export function getTeaser(): Promise<TeaserResult> {
  return request("/api/teaser");
}

export const cvKey = (cvId: string) => ["cv", cvId] as const;
export const teaserKey = (cvId: string) => ["teaser", cvId] as const;

/** Same limits the routes enforce, checked first so an obvious miss costs no upload. */
export const CV_MAX_BYTES = 5 * 1024 * 1024;
export const CV_TEXT_MIN_CHARS = 200;
export const CV_TEXT_MAX_CHARS = 30_000;

export function precheckFile(file: File): CvClientError | null {
  if (file.size > CV_MAX_BYTES) return "cv_too_large";
  const name = file.name.toLowerCase();
  const looksRight =
    name.endsWith(".pdf") ||
    name.endsWith(".docx") ||
    file.type === "application/pdf" ||
    file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  // The route sniffs magic bytes; this only spares an upload for what is plainly not a CV.
  return looksRight && file.size > 0 ? null : "cv_bad_type";
}

const STORAGE_KEY = "pemby-cv-id";

type Listener = () => void;
const listeners = new Set<Listener>();

/**
 * The tab's latest CV id, as a subscribable store so a reload shows the CV again without an effect
 * writing state. The API stays the source of truth; storage may be blocked, in which case a reload
 * simply starts over.
 */
export const cvIdStore = {
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  read(): string | null {
    try {
      return window.sessionStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  },
  /** Server render and hydration: nothing is known about the tab yet. */
  readServer(): string | null {
    return null;
  },
  write(cvId: string) {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, cvId);
    } catch {
      // Blocked storage: this flow still works, a reload starts over.
    }
    for (const listener of listeners) listener();
  },
  clear() {
    try {
      window.sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // Nothing stored.
    }
    for (const listener of listeners) listener();
  },
};
