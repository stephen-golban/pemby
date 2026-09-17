// `cv.extract` (phase 06 contract, flow step 4): bucket object → plain text → `cv.parse`.
import { execFile } from "node:child_process";
import { fork } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { schema, type Db } from "@pemby/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { PgBoss } from "pg-boss";

import type { CvBucket } from "./bucket";
import type { ExtractChildInput, ExtractChildOutput } from "./extract-child";
import { checkPdfBombs, checkZipBombs } from "./inflate-guard";
import { CV_EXTRACT_TIMEOUT_MS, CV_PARSE_QUEUE, type CvJobData } from "./queues";
import { checkDocxZip } from "./zip-guard";

const { cvFiles } = schema;

/** Fewer non-whitespace characters than this in the whole document: scanned or empty. */
export const CV_MIN_TEXT_CHARS = 200;
export const CV_MAX_TEXT_CHARS = 30_000;
/**
 * Resident memory the extraction child may use before it is killed. pdf.js keeps decoded streams
 * in typed arrays outside the V8 heap, so `--max-old-space-size` alone does not bound a file; the
 * parent polls RSS and kills. 400 MB leaves headroom under a 1 GB container.
 */
const CHILD_MAX_RSS_BYTES = 400 * 1024 * 1024;
const CHILD_MAX_OLD_GENERATION_MB = 256;
/** How often the parent samples the child's RSS. A deflate bomb grows at roughly 1 GB/s. */
const RSS_POLL_MS = 50;

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export type ExtractErrorCode =
  "scanned_or_empty" | "extract_failed" | "extract_timeout" | "docx_too_large" | "file_too_complex";

export type ExtractOutcome =
  | { kind: "skipped"; reason: "not_found_or_not_pending" | "row_changed" }
  | {
      kind: "unreadable";
      code: ExtractErrorCode;
      errorName?: string;
      ms: number;
      peakRssMb?: number;
    }
  | { kind: "failed"; code: "extract_failed" | "enqueue_failed"; errorName: string; ms: number }
  | { kind: "parsing"; chars: number; ms: number; peakRssMb: number };

export interface ExtractDeps {
  db: Db;
  boss: PgBoss;
  bucket: CvBucket;
}

/**
 * NFC, C0 control characters dropped (Postgres refuses U+0000 in text, and a DOCX can carry one),
 * spaces collapsed within lines, at most one blank line in a row, capped.
 */
export function normalizeCvText(raw: string): string {
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
      .slice(0, CV_MAX_TEXT_CHARS)
  );
}

export function nonWhitespaceLength(text: string): number {
  return text.replace(/\s+/g, "").length;
}

type ChildResult = ExtractChildOutput | { ok: false; errorName: "timeout" | "memory" };

const execFileAsync = promisify(execFile);

/** Resident set size of another process, in bytes; 0 when it cannot be read (it has exited). */
async function processRss(pid: number): Promise<number> {
  try {
    if (process.platform === "linux") {
      const status = await readFile(`/proc/${pid}/status`, "utf8");
      const match = /VmRSS:\s+(\d+) kB/.exec(status);
      return match ? Number(match[1]) * 1024 : 0;
    }
    const { stdout } = await execFileAsync("ps", ["-o", "rss=", "-p", String(pid)]);
    return Number(stdout.trim()) * 1024;
  } catch {
    return 0;
  }
}

export interface ChildRun {
  result: ChildResult;
  peakRssBytes: number;
}

/**
 * Runs the parser in a child process, racing it against `timeoutMs` while watching its memory. On
 * timeout, abort or an RSS over the limit the child is killed, so a hostile file cannot keep
 * allocating or burning CPU after the job gives up.
 */
function extractInChild(
  input: ExtractChildInput,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<ChildRun> {
  const child = fork(new URL("./extract-child.ts", import.meta.url), [], {
    serialization: "advanced",
    // The child never writes to this process's stdio: parser warnings can quote document content.
    stdio: ["ignore", "ignore", "ignore", "ipc"],
    execArgv: [...process.execArgv, `--max-old-space-size=${CHILD_MAX_OLD_GENERATION_MB}`],
  });
  let peakRssBytes = 0;
  let timer: NodeJS.Timeout | undefined;
  let poll: NodeJS.Timeout | undefined;

  const settled = new Promise<ChildResult>((resolve) => {
    child.once("message", (message) => resolve(message as ExtractChildOutput));
    child.once("error", (error) => resolve({ ok: false, errorName: error.name }));
    child.once("exit", (code, killedBy) =>
      resolve({ ok: false, errorName: killedBy ? "killed" : `exit_${code}` }),
    );
    timer = setTimeout(() => resolve({ ok: false, errorName: "timeout" }), timeoutMs);
    signal?.addEventListener("abort", () => resolve({ ok: false, errorName: "timeout" }), {
      once: true,
    });
    let checking = false;
    poll = setInterval(() => {
      if (checking || child.pid === undefined) return;
      checking = true;
      void processRss(child.pid)
        .then((rss) => {
          peakRssBytes = Math.max(peakRssBytes, rss);
          if (rss > CHILD_MAX_RSS_BYTES) resolve({ ok: false, errorName: "memory" });
        })
        .finally(() => {
          checking = false;
        });
    }, RSS_POLL_MS);
  });

  child.send(input);
  return settled
    .then((result) => ({ result, peakRssBytes }))
    .finally(() => {
      clearTimeout(timer);
      clearInterval(poll);
      child.kill("SIGKILL");
    });
}

async function finish(
  db: Db,
  cvId: string,
  status: "unreadable" | "failed",
  code: string,
): Promise<void> {
  await db
    .update(cvFiles)
    .set({ parseStatus: status, errorCode: code })
    .where(and(eq(cvFiles.id, cvId), eq(cvFiles.parseStatus, "extracting")));
}

export async function extractCv(
  deps: ExtractDeps,
  cvId: string,
  options: { lastAttempt: boolean; signal?: AbortSignal },
): Promise<ExtractOutcome> {
  const { db, boss, bucket } = deps;
  const started = Date.now();
  const ms = () => Date.now() - started;

  // `extracting` is accepted too: a retry after a crash or expiry picks the row up again.
  const [row] = await db
    .update(cvFiles)
    .set({ parseStatus: "extracting", errorCode: null })
    .where(
      and(
        eq(cvFiles.id, cvId),
        eq(cvFiles.source, "file"),
        inArray(cvFiles.parseStatus, ["uploaded", "extracting"]),
      ),
    )
    .returning({ bucketKey: cvFiles.bucketKey, mimeType: cvFiles.mimeType });
  if (!row?.bucketKey) return { kind: "skipped", reason: "not_found_or_not_pending" };

  let bytes: Uint8Array;
  try {
    bytes = await bucket.get(row.bucketKey);
  } catch (error) {
    const errorName = error instanceof Error ? error.name : "error";
    // A missing object will not appear on retry.
    if (errorName === "NoSuchKey" || options.lastAttempt) {
      await finish(db, cvId, "failed", "extract_failed");
      return { kind: "failed", code: "extract_failed", errorName, ms: ms() };
    }
    throw error;
  }

  const kind = row.mimeType === DOCX_MIME ? "docx" : "pdf";
  if (kind === "docx") {
    const guard = checkDocxZip(bytes);
    if (guard !== "ok") {
      const code = guard === "too_large" ? "docx_too_large" : "extract_failed";
      await finish(db, cvId, "unreadable", code);
      return { kind: "unreadable", code, ms: ms() };
    }
  }
  // Decompression bombs, before any parser touches the bytes.
  const bombs = kind === "docx" ? checkZipBombs(bytes) : checkPdfBombs(bytes);
  if (bombs !== "ok") {
    const code = bombs === "too_large" ? "file_too_complex" : "extract_failed";
    await finish(db, cvId, "unreadable", code);
    return { kind: "unreadable", code, ms: ms() };
  }

  const remaining = Math.max(1_000, CV_EXTRACT_TIMEOUT_MS - ms());
  const run = await extractInChild({ kind, bytes }, remaining, options.signal);
  const peakRssMb = Math.round(run.peakRssBytes / 1024 / 1024);
  const result = run.result;
  if (!result.ok) {
    const code =
      result.errorName === "timeout"
        ? "extract_timeout"
        : result.errorName === "memory"
          ? "file_too_complex"
          : "extract_failed";
    await finish(db, cvId, "unreadable", code);
    return { kind: "unreadable", code, errorName: result.errorName, ms: ms(), peakRssMb };
  }

  if (nonWhitespaceLength(result.text) < CV_MIN_TEXT_CHARS) {
    await finish(db, cvId, "unreadable", "scanned_or_empty");
    return { kind: "unreadable", code: "scanned_or_empty", ms: ms() };
  }

  const text = normalizeCvText(result.text);
  const timings = JSON.stringify({ extractedAt: new Date().toISOString() });
  const updated = await db
    .update(cvFiles)
    .set({
      extractedText: text,
      parseStatus: "parsing",
      errorCode: null,
      stageTimings: sql`coalesce(${cvFiles.stageTimings}, '{}'::jsonb) || ${timings}::jsonb`,
    })
    .where(and(eq(cvFiles.id, cvId), eq(cvFiles.parseStatus, "extracting")))
    .returning({ id: cvFiles.id });
  if (updated.length === 0) return { kind: "skipped", reason: "row_changed" };

  try {
    await boss.send(CV_PARSE_QUEUE, { cvId } satisfies CvJobData);
  } catch (error) {
    await db
      .update(cvFiles)
      .set({ parseStatus: "failed", errorCode: "enqueue_failed" })
      .where(and(eq(cvFiles.id, cvId), eq(cvFiles.parseStatus, "parsing")));
    const errorName = error instanceof Error ? error.name : "error";
    return { kind: "failed", code: "enqueue_failed", errorName, ms: ms() };
  }
  return { kind: "parsing", chars: text.length, ms: ms(), peakRssMb };
}
