"use client";

import type {
  BriefView,
  FlagBody,
  MatchStatePatch,
  PreferencesPatch,
} from "@/app/api/brief/_lib/view";
import { optimisticUpdate } from "@/lib/optimistic";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  briefKey,
  errorCodeOf,
  getBrief,
  patchMatchState,
  patchPreferences,
  postFlag,
  type BriefClientError,
} from "./api";

/**
 * The Brief, and three optimistic writers for it.
 *
 * Every action — Apply, Save, "Not for me", a flag, and either one-tap fix — writes the `["brief"]`
 * cache in the same frame, sends the request, and restores the snapshot on failure
 * (docs/conventions.md, Optimistic UI). All three share one cache entry, so flipping "include the
 * likely ones" from a near-miss group and from the rail is the same update seen twice.
 *
 * `onSettled` refetches, so a value the server normalized settles to what was stored.
 */
export function useBrief(initial: BriefView) {
  const query = useQuery({ queryKey: briefKey, queryFn: getBrief, initialData: initial });
  const [error, setError] = useState<BriefClientError | null>(null);

  const state = useMutation({
    mutationFn: patchMatchState,
    ...optimisticUpdate<BriefView, MatchStatePatch>(briefKey, (previous, patch) => {
      const base = previous ?? initial;
      return {
        ...base,
        matches: base.matches.map((match) =>
          match.matchId === patch.matchId
            ? { ...match, state: patch.state, passReason: patch.passReason ?? null }
            : match,
        ),
      };
    }),
  });

  const flag = useMutation({
    mutationFn: postFlag,
    ...optimisticUpdate<BriefView, FlagBody>(briefKey, (previous, body) => {
      const base = previous ?? initial;
      return {
        ...base,
        matches: base.matches.map((match) =>
          match.jobId === body.jobId ? { ...match, flagged: true } : match,
        ),
      };
    }),
  });

  const preferences = useMutation({
    mutationFn: patchPreferences,
    ...optimisticUpdate<BriefView, PreferencesPatch>(briefKey, (previous, patch) => ({
      ...(previous ?? initial),
      ...patch,
    })),
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
    brief: query.data,
    /** True while the list is being re-read; rows dim rather than disappear. */
    pending: query.isFetching,
    failed: query.isError,
    retry: () => void query.refetch(),
    setMatchState: run<MatchStatePatch>(state),
    flagJob: run<FlagBody>(flag),
    setPreferences: run<PreferencesPatch>(preferences),
    error,
    clearError: () => setError(null),
  };
}

export type BriefController = ReturnType<typeof useBrief>;
