"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { OpenRouterError, OpenRouterKeyView } from "@/app/api/openrouter/_lib/view";
import { optimisticUpdate } from "@/lib/optimistic";
import {
  checkOpenRouterKey,
  deleteOpenRouterKey,
  getOpenRouterKey,
  openRouterErrorOf,
  openRouterKeyQuery,
  startOpenRouterConnect,
} from "./openrouter-api";

/** What the OAuth callback put in `?openrouter=`: the good outcome, one of the codes, or nothing. */
export type OpenRouterOutcome = OpenRouterError | "connected" | null;

const DISCONNECTED: OpenRouterKeyView = {
  connected: false,
  label: null,
  keyHash: null,
  connectedAt: null,
  lastUsedAt: null,
};

/**
 * The connected-key row, and the three things that can be done to it.
 *
 * **Disconnect is optimistic** in the ordinary way: the row reads "Not connected" in the same frame
 * and goes back with its reason if the delete fails (docs/conventions.md, Optimistic UI; PLAN D20).
 *
 * **Connect is optimistic too, in the only sense available to it.** It does browser work — it hands
 * the tab to openrouter.ai — so there is no server state to write ahead of; what it can do, and
 * does, is say so in the same frame rather than freezing the page behind a spinner while a request
 * it cannot see completes. That is the arrangement `use-settings.ts` already uses for push, which
 * is optimistic across a permission prompt the browser owns.
 *
 * **`revoked` is the whole reason this hook holds state at all.** Disconnecting deletes Pemby's
 * copy of the key and nothing else — Pemby cannot revoke a key on somebody else's account — so the
 * one thing the person needs immediately afterwards is the link to the page where they *can*. That
 * link is built from the key's hash, which the row carried and the delete took away. So the hash is
 * captured before the mutation and kept here until they leave the page.
 */
export function useOpenRouter(initial: OpenRouterKeyView, arrivedWith: OpenRouterOutcome) {
  const query = useQuery({
    queryKey: openRouterKeyQuery,
    queryFn: getOpenRouterKey,
    initialData: initial,
  });
  const [error, setError] = useState<OpenRouterError | null>(
    arrivedWith !== null && arrivedWith !== "connected" ? arrivedWith : null,
  );
  /** True while the outcome on screen came back from OpenRouter rather than from a click here. */
  const [fromCallback, setFromCallback] = useState(arrivedWith !== null);
  const [justConnected, setJustConnected] = useState(arrivedWith === "connected");
  const [revoked, setRevoked] = useState<string | null>(null);

  /**
   * Take the outcome out of the address bar once it has been read.
   *
   * `replaceState` rather than a navigation: the banner is about what just happened, and a
   * reloaded page that still announces it is a page describing an event that is over. The query
   * string is the only thing removed; nothing else about the history entry changes.
   */
  useEffect(() => {
    if (!fromCallback) return;
    window.history.replaceState(window.history.state, "", window.location.pathname);
  }, [fromCallback]);

  function report(failure: unknown) {
    setFromCallback(false);
    setJustConnected(false);
    setError(openRouterErrorOf(failure));
  }

  /** Clear whatever the last action said, so two outcomes are never on screen at once. */
  function reset() {
    setError(null);
    setFromCallback(false);
    setJustConnected(false);
  }

  const connect = useMutation({
    mutationFn: startOpenRouterConnect,
    onSuccess: ({ url }) => {
      // Leaves this page. Nothing after this runs in a tab the person is still looking at.
      window.location.assign(url);
    },
    onError: report,
  });

  const disconnect = useMutation({
    mutationFn: deleteOpenRouterKey,
    ...optimisticUpdate<OpenRouterKeyView, void>(openRouterKeyQuery, () => DISCONNECTED),
  });

  const check = useMutation({ mutationFn: checkOpenRouterKey });

  return {
    key: query.data,
    error,
    /** Whether `error` is the result of coming back from OpenRouter, which needs its own sentence. */
    fromCallback,
    /** True on the paint straight after a successful round trip, for the one confirming line. */
    justConnected,
    /** Non-null once a key has been disconnected in this visit: the hash of the key to revoke. */
    revoked,
    connecting: connect.isPending,
    checking: check.isPending,
    /** Set by a successful check and cleared by anything else, so "it works" is never stale. */
    checked: check.isSuccess && !check.isPending,
    connect: () => {
      reset();
      connect.mutate();
    },
    disconnect: () => {
      reset();
      const hash = query.data.keyHash;
      setRevoked(hash);
      disconnect.mutate(undefined, {
        onError: (failure) => {
          // The key is still connected, so the "revoke it yourself" panel would be a lie.
          setRevoked(null);
          report(failure);
        },
      });
    },
    check: () => {
      reset();
      check.mutate(undefined, { onError: report });
    },
    dismissRevoked: () => setRevoked(null),
  };
}

export type OpenRouterController = ReturnType<typeof useOpenRouter>;
