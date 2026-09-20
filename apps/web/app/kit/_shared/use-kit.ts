"use client";

import type {
  ApplicationDefaultsPatch,
  KitContentView,
  KitPageView,
} from "@/app/api/kit/_lib/view";
import { optimisticUpdate } from "@/lib/optimistic";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import {
  errorCodeOf,
  getKitPage,
  kitKey,
  patchDefaults,
  postApplied,
  streamKit,
  type KitClientError,
} from "./api";

/**
 * The kit surface, and its three writers.
 *
 * **Saving the application defaults** is an ordinary optimistic mutation: it changes a value the
 * `["kit", jobId]` cache is already holding, so `optimisticUpdate` writes it in the same frame and
 * restores the snapshot on failure (docs/conventions.md, Optimistic UI). It has two callers with
 * one code path: `saveDefaults` stores one of the four answers, and `confirmDefaults` says the
 * form is dealt with. Only the second retires the first-time gate.
 *
 * **Generating** is optimistic too, and about the thing that is actually at stake. There is no kit
 * in the cache to write early — it does not exist until the model finishes — but the quota does,
 * and asking for a kit spends one. So the counter moves to "2 of 3" on the tap, rolls back if the
 * generation fails, and settles to the server's number when the page re-reads. The text itself is
 * the other half: the sections appear on the tap and fill as the stream arrives, rather than the
 * reader watching a spinner for twenty seconds and then being handed a finished page.
 *
 * **"I applied"** is the third, and the only write on this page that reaches outside the kit: it
 * records, in `applications`, something the person already did in the employer's own form, which is
 * what puts the post on the tracker board. Nothing behind it submits anything (PLAN D9, D16).
 *
 * `draft` holds the partial content while a generation runs. It is cleared on failure, so a
 * half-written letter never sits on the page under an error message as though it were saved.
 */
export function useKit(jobId: string, initial: KitPageView) {
  const key = kitKey(jobId);
  const query = useQuery({ queryKey: key, queryFn: () => getKitPage(jobId), initialData: initial });
  const [error, setError] = useState<KitClientError | null>(null);
  const [draft, setDraft] = useState<Partial<KitContentView> | null>(null);
  const abort = useRef<AbortController | null>(null);

  // A reader who navigates away mid-generation stops paying for the rest of it. The server sees the
  // request abort and hands the signal to the task, which stops the stream and records the attempt.
  useEffect(() => () => abort.current?.abort(), []);

  const generate = useMutation({
    mutationFn: async () => {
      const controller = new AbortController();
      abort.current = controller;
      return streamKit(jobId, { onPartial: setDraft, signal: controller.signal });
    },
    ...optimisticUpdate<KitPageView, void>(key, (previous) => {
      const base = previous ?? initial;
      return { ...base, quota: { ...base.quota, used: base.quota.used + 1 } };
    }),
  });

  const defaults = useMutation({
    mutationFn: patchDefaults,
    ...optimisticUpdate<KitPageView, ApplicationDefaultsPatch>(key, (previous, patch) => {
      const base = previous ?? initial;
      // `answered` is the reader's decision, not one of their answers, so it is kept out of the
      // view object and read on its own below.
      const { answered, ...values } = patch;
      return {
        ...base,
        defaults: {
          ...base.defaults,
          ...values,
          workAuthorization: {
            ...base.defaults.workAuthorization,
            ...(patch.workAuthorization ?? {}),
          },
          // Only "Save and continue" retires the form. A field save leaves `answeredAt` exactly as
          // it was, so answering one question no longer counts as answering all four — the defect
          // that made the other three unreachable for good. The server stamps the real instant;
          // this only has to release the gate in the frame between the tap and the answer.
          answeredAt:
            answered === true && base.defaults.answeredAt === null
              ? new Date().toISOString()
              : base.defaults.answeredAt,
        },
      };
    }),
  });

  // "I applied": optimistic like everything else here, and the only thing on this page that writes
  // outside the kit. It records what the person did in the employer's own form; it submits nothing.
  const applied = useMutation({
    mutationFn: () => postApplied(jobId),
    ...optimisticUpdate<KitPageView, void>(key, (previous) => ({
      ...(previous ?? initial),
      applied: true,
    })),
  });

  return {
    page: query.data,
    /** True while the page is being re-read; nothing disappears, it just dims. */
    pending: query.isFetching,
    failed: query.isError,
    retry: () => void query.refetch(),
    draft,
    generating: generate.isPending,
    write: () => {
      setError(null);
      setDraft(null);
      generate.mutate(undefined, {
        onError: (failure) => {
          setDraft(null);
          setError(errorCodeOf(failure));
        },
      });
    },
    markApplied: () => {
      setError(null);
      applied.mutate(undefined, { onError: (failure) => setError(errorCodeOf(failure)) });
    },
    saveDefaults: (patch: ApplicationDefaultsPatch) => {
      setError(null);
      defaults.mutate(patch, { onError: (failure) => setError(errorCodeOf(failure)) });
    },
    /**
     * "Save and continue": the form is dealt with, whatever is still blank. The one thing that
     * releases the first-time gate, and the only writer of `answeredAt`.
     */
    confirmDefaults: () => {
      setError(null);
      defaults.mutate({ answered: true }, { onError: (failure) => setError(errorCodeOf(failure)) });
    },
    error,
    clearError: () => setError(null),
  };
}

export type KitController = ReturnType<typeof useKit>;
