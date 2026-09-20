"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import type { AdminFlagPatch, AdminJobPatch, AdminView } from "@/app/api/admin/_lib/view";
import { optimisticUpdate } from "@/lib/optimistic";
import {
  adminKey,
  errorCodeOf,
  getAdmin,
  postFlagAction,
  postJobAction,
  type AdminClientError,
} from "./api";

/**
 * The admin view and the one write this page makes.
 *
 * Approve and dismiss both remove the row from the queue in the same frame and restore it on
 * failure (docs/conventions.md, Optimistic UI). Removal is the whole optimistic update: an approved
 * flag also quarantines its job, and the quarantined panel is left to `onSettled`'s refetch rather
 * than given a fabricated row — a panel whose job is to say what is in the database is the last
 * place to invent a line in it.
 *
 * `optimisticUpdate` owns `onMutate` / `onError` / `onSettled`, so the surface's error state is kept
 * here and passed per call to `mutate`, never by overriding them.
 */
export function useAdmin(initial: AdminView) {
  const query = useQuery({ queryKey: adminKey, queryFn: getAdmin, initialData: initial });
  const [error, setError] = useState<AdminClientError | null>(null);

  // A flag can be decided from either list, so both drop the row. The quarantined panel is left to
  // `onSettled`'s refetch rather than given or denied a fabricated row — a panel whose job is to say
  // what is in the database is the last place to invent a line in it, or to remove one early.
  const flag = useMutation({
    mutationFn: postFlagAction,
    ...optimisticUpdate<AdminView, AdminFlagPatch>(adminKey, (previous, patch) => {
      const base = previous ?? initial;
      return {
        ...base,
        flags: base.flags.filter((row) => row.flagId !== patch.flagId),
        automatedActions: base.automatedActions.filter((row) => row.flagId !== patch.flagId),
      };
    }),
  });

  const job = useMutation({
    mutationFn: postJobAction,
    ...optimisticUpdate<AdminView, AdminJobPatch>(adminKey, (previous, patch) => {
      const base = previous ?? initial;
      return {
        ...base,
        quarantined: base.quarantined.filter((row) => row.jobId !== patch.jobId),
      };
    }),
  });

  return {
    view: query.data,
    /** True while the page is being re-read; panels dim rather than disappear. */
    pending: query.isFetching,
    failed: query.isError,
    retry: () => void query.refetch(),
    actionFlag: (patch: AdminFlagPatch) => {
      setError(null);
      flag.mutate(patch, { onError: (failure) => setError(errorCodeOf(failure)) });
    },
    actionJob: (patch: AdminJobPatch) => {
      setError(null);
      job.mutate(patch, { onError: (failure) => setError(errorCodeOf(failure)) });
    },
    error,
    clearError: () => setError(null),
  };
}

export type AdminController = ReturnType<typeof useAdmin>;
