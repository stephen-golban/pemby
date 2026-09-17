"use client";

import type { ProfilePatch, ProfileView } from "@/app/api/profile/_lib/view";
import { optimisticUpdate } from "@/lib/optimistic";
import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import {
  errorCodeOf,
  getMatchCount,
  getProfile,
  matchCountKey,
  matchCountQuery,
  patchProfile,
  profileKey,
  type ProfileClientError,
} from "./api";
import type { TeaserResult } from "@/lib/teaser";

/**
 * The profile, and one optimistic writer for it.
 *
 * Every editor calls `save(patch)`: the row shows the new value in the same frame, the request
 * follows, and a failure restores the snapshot and leaves `error` set (docs/conventions.md,
 * Optimistic UI). `onSettled` refetches, so an accepted value that the server normalized (a title
 * trimmed, a duplicate dropped) settles to what was stored.
 */
export function useProfile(initial: ProfileView) {
  const query = useQuery({ queryKey: profileKey, queryFn: getProfile, initialData: initial });
  const [error, setError] = useState<ProfileClientError | null>(null);

  const mutation = useMutation({
    mutationFn: patchProfile,
    ...optimisticUpdate<ProfileView, ProfilePatch>(profileKey, (previous, patch) => ({
      ...(previous ?? initial),
      ...patch,
    })),
  });

  // `optimisticUpdate` owns onMutate/onError/onSettled, so the surface's own error state is kept
  // here rather than by overriding them.
  function save(patch: ProfilePatch) {
    setError(null);
    mutation.mutate(patch, { onError: (failure) => setError(errorCodeOf(failure)) });
  }

  return {
    profile: query.data,
    save,
    saving: mutation.isPending,
    error,
    clearError: () => setError(null),
  };
}

/** How long editing pauses before the count is asked for again. */
const COUNT_DEBOUNCE_MS = 500;

export interface MatchCount {
  result: TeaserResult | undefined;
  /** A new number is being worked out: keep the last one on screen, quietly. */
  pending: boolean;
  failed: boolean;
  retry: () => void;
}

/** No ways of working accepted means nothing can match, which is what the route would also say. */
function noWaysResult(country: string | null): TeaserResult {
  return { country, countryName: null, count: 0, jobs: [], basis: "ok" };
}

/**
 * The live match count (PLAN D5), through the same `TeaserSource` interface the landing teaser
 * uses and therefore green tier only — never yellow, for anonymous or free users.
 *
 * The count follows the profile on screen, debounced: while the debounce or the request is in
 * flight the last known number stays put and the caller renders it quietly, so an edit never
 * flashes a number that was never true.
 */
export function useMatchCount(profile: ProfileView, enabled = true): MatchCount {
  const query = matchCountQuery(profile);
  const noWays = profile.waysOfWorking.length === 0;

  const [settled, setSettled] = useState(query);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (query === settled) return;
    timer.current = setTimeout(() => setSettled(query), COUNT_DEBOUNCE_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [query, settled]);

  const count = useQuery({
    queryKey: matchCountKey(settled),
    queryFn: () => getMatchCount(settled),
    enabled: enabled && !noWays,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    retry: 1,
  });

  return {
    result: noWays ? noWaysResult(profile.residenceCountry) : count.data,
    pending: !noWays && (query !== settled || count.isFetching),
    failed: !noWays && count.isError,
    retry: () => void count.refetch(),
  };
}
