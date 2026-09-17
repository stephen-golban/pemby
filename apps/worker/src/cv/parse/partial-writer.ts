// Throttled writes of streamed `parsed_partial` snapshots for one cv_files row.
//
// The stream awaits `onPartial`, so `push` never touches the database itself: it keeps the latest
// snapshot and schedules a flush at most once per interval. Writes run one after another on a
// promise chain, never concurrently. `close()` drops any unflushed snapshot and waits for the write
// in flight, so the final result written afterwards always wins. Snapshots are never logged.
import type { ParsedProfilePartial } from "@pemby/core";
import { schema, type Db } from "@pemby/db";
import { and, eq, sql } from "drizzle-orm";

const { cvFiles } = schema;

export const PARTIAL_WRITE_INTERVAL_MS = 700;

export interface PartialWriter {
  push(partial: unknown): void;
  /** Stops scheduling, waits for the write in flight. Safe to call twice. */
  close(): Promise<void>;
  readonly stats: { writes: number; failedWrites: number; firstPartialAt: Date | null };
}

export function createPartialWriter(
  db: Db,
  cvId: string,
  intervalMs: number = PARTIAL_WRITE_INTERVAL_MS,
): PartialWriter {
  let pending: ParsedProfilePartial | null = null;
  let lastFlushAt = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let chain: Promise<void> = Promise.resolve();
  let closed = false;
  let firstTimingWritten = false;
  const stats = { writes: 0, failedWrites: 0, firstPartialAt: null as Date | null };

  const write = async (snapshot: ParsedProfilePartial, firstPartialAt: string | null) => {
    await db
      .update(cvFiles)
      .set({
        parsedPartial: snapshot,
        ...(firstPartialAt === null
          ? {}
          : {
              stageTimings: sql`coalesce(${cvFiles.stageTimings}, '{}'::jsonb) || ${JSON.stringify({ firstPartialAt })}::jsonb`,
            }),
      })
      // Only while parsing: a late write must never touch a finished, failed or replaced row.
      .where(and(eq(cvFiles.id, cvId), eq(cvFiles.parseStatus, "parsing")));
  };

  const flush = () => {
    timer = undefined;
    if (closed || pending === null) return;
    const snapshot = pending;
    pending = null;
    lastFlushAt = Date.now();
    const first =
      !firstTimingWritten && stats.firstPartialAt ? stats.firstPartialAt.toISOString() : null;
    firstTimingWritten = true;
    chain = chain.then(() =>
      write(snapshot, first).then(
        () => {
          stats.writes += 1;
        },
        (error: unknown) => {
          // A lost snapshot only delays the preview; the final result is written separately.
          stats.failedWrites += 1;
          console.warn(
            `cv.parse cv=${cvId} partial write failed: ${error instanceof Error ? error.name : "error"}`,
          );
        },
      ),
    );
  };

  return {
    stats,
    push(partial) {
      if (closed || typeof partial !== "object" || partial === null) return;
      // `{}` from the first token carries nothing to show.
      if (Object.keys(partial).length === 0) return;
      stats.firstPartialAt ??= new Date();
      pending = partial as ParsedProfilePartial;
      if (timer !== undefined) return;
      const wait = lastFlushAt + intervalMs - Date.now();
      if (wait <= 0) flush();
      else timer = setTimeout(flush, wait);
    },
    async close() {
      closed = true;
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
      pending = null;
      await chain;
    },
  };
}
