"use client";

import type { LocationReport, StatePatch, TrackerView } from "@/app/api/applications/_lib/view";
import { optimisticUpdate } from "@/lib/optimistic";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  errorCodeOf,
  getTracker,
  patchApplicationState,
  postLocationRejection,
  trackerKey,
  type TrackerClientError,
} from "./api";

/**
 * The board, and two optimistic writers for it.
 *
 * The optimistic update here is unusually cheap and unusually convincing, and that is a consequence
 * of the view carrying **facts rather than columns**. A state change writes one field on one row;
 * the board re-runs `trackerColumnOf` — the same function the server would have run, and the same
 * one the worker runs for the Telegram card — and the row moves column in the same frame. Nothing
 * in this file knows which column anything belongs in.
 *
 * `updatedAt` is moved forward with the change, because the board sorts by last activity and a row
 * that jumps column while staying in place halfway down the list reads as a failure.
 */
export function useTracker(initial: TrackerView) {
  const query = useQuery({ queryKey: trackerKey, queryFn: getTracker, initialData: initial });
  const [error, setError] = useState<TrackerClientError | null>(null);

  const state = useMutation({
    mutationFn: patchApplicationState,
    ...optimisticUpdate<TrackerView, StatePatch>(trackerKey, (previous, patch) => {
      const base = previous ?? initial;
      const now = new Date().toISOString();
      return {
        ...base,
        rows: base.rows.map((row) =>
          row.jobId === patch.jobId
            ? {
                ...row,
                applicationState: patch.state,
                // An application row exists, so the person applied; the server marks the match the
                // same way, and showing anything else here would be a rollback waiting to happen.
                matchState: row.matchState === null ? null : "applied",
                appliedAt: row.appliedAt ?? now,
                updatedAt: now,
              }
            : row,
        ),
      };
    }),
  });

  const location = useMutation({
    mutationFn: postLocationRejection,
    ...optimisticUpdate<TrackerView, LocationReport>(trackerKey, (previous, body) => {
      const base = previous ?? initial;
      return {
        ...base,
        rows: base.rows.map((row) =>
          row.jobId === body.jobId ? { ...row, rejectedForLocation: true } : row,
        ),
      };
    }),
  });

  // `optimisticUpdate` owns onMutate/onError/onSettled, so the surface's own error state is kept
  // here rather than by overriding them.
  function run<T>(mutation: {
    mutate: (vars: T, options: { onError: (e: unknown) => void }) => void;
  }) {
    return (vars: T) => {
      setError(null);
      mutation.mutate(vars, { onError: (failure) => setError(errorCodeOf(failure)) });
    };
  }

  return {
    tracker: query.data,
    /** True while the board is being re-read; rows dim rather than disappear. */
    pending: query.isFetching,
    failed: query.isError,
    retry: () => void query.refetch(),
    setState: run<StatePatch>(state),
    reportLocation: run<LocationReport>(location),
    error,
  };
}

export type TrackerController = ReturnType<typeof useTracker>;
