"use client";

import type { ChannelPatch, ChannelSettingsView, QuietView } from "@/app/api/channels/_lib/view";
import { optimisticUpdate } from "@/lib/optimistic";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import {
  deletePushSubscription,
  deleteTelegram,
  errorCodeOf,
  getSettings,
  patchSettings,
  postPushSubscription,
  settingsKey,
  SettingsRequestError,
  type SettingsClientError,
} from "./api";
import {
  currentSubscription,
  pushFingerprint,
  resubscribeHere,
  subscribeHere,
  unsubscribeHere,
} from "./push";

const EMPTY_QUIET: QuietView = { startMinute: null, endMinute: null, timezone: null };

/**
 * The channel settings, and four optimistic writers for them.
 *
 * Every switch on the page writes the `["channel-settings"]` cache in the same frame, sends the
 * request, and restores the snapshot on failure (docs/conventions.md, Optimistic UI; PLAN D20).
 * `onSettled` refetches, so a value the server normalized settles to what was stored.
 *
 * Push is the one that does browser work before it does network work — a permission prompt and a
 * subscription — and it is optimistic all the same: the row reads "on" while the prompt is open and
 * goes back if the answer is no. That is the honest order. The alternative, a spinner until the
 * person answers a prompt they can leave open for a minute, freezes the page on a question the
 * browser owns.
 */
export function useSettings(initial: ChannelSettingsView, vapidPublicKey: string | null) {
  const client = useQueryClient();
  const query = useQuery({ queryKey: settingsKey, queryFn: getSettings, initialData: initial });
  const settings = query.data;
  const [error, setError] = useState<SettingsClientError | null>(null);

  /**
   * The fingerprint of the subscription this browser holds, or null for none. A browser fact, read
   * once; `crypto.subtle` is unavailable outside a secure context, and so is push.
   */
  const [localFingerprint, setLocalFingerprint] = useState<string | null>(null);
  /**
   * The endpoint behind that fingerprint. Kept in a ref, never in the view and never in a URL: it
   * is a bearer credential, and the only thing that needs it is "forget every browser but this
   * one", which has to name the row to spare.
   */
  const localEndpoint = useRef<string | null>(null);
  /** The optimistic overlay while a push mutation is in flight; null means "read the real answer". */
  const [pushPending, setPushPending] = useState<boolean | null>(null);

  const patch = useMutation({
    mutationFn: patchSettings,
    ...optimisticUpdate<ChannelSettingsView, ChannelPatch>(settingsKey, (previous, body) => {
      const base = previous ?? initial;
      return {
        ...base,
        telegram:
          body.telegram === undefined
            ? base.telegram
            : {
                ...base.telegram,
                enabled: body.telegram,
                dead: body.telegram ? null : base.telegram.dead,
              },
        email:
          body.email === undefined
            ? base.email
            : {
                ...base.email,
                configured: base.email.configured || body.email,
                enabled: body.email,
                dead: body.email ? null : base.email.dead,
              },
        quiet: body.quiet === undefined ? base.quiet : (body.quiet ?? EMPTY_QUIET),
        pausedAt:
          body.paused === undefined
            ? base.pausedAt
            : body.paused
              ? (base.pausedAt ?? new Date().toISOString())
              : null,
      };
    }),
  });

  const disconnect = useMutation({
    mutationFn: deleteTelegram,
    ...optimisticUpdate<ChannelSettingsView, void>(settingsKey, (previous) => {
      const base = previous ?? initial;
      return {
        ...base,
        telegram: { configured: false, enabled: false, address: null, dead: null, since: null },
      };
    }),
  });

  const push = useMutation({
    mutationFn: async (on: boolean): Promise<ChannelSettingsView> => {
      if (!on) {
        const endpoint = await unsubscribeHere();
        localEndpoint.current = null;
        setLocalFingerprint(null);
        // Nothing local to drop: the row this browser would have owned is already gone, so re-read
        // rather than deleting by an endpoint we do not have.
        return endpoint ? deletePushSubscription({ endpoint }) : getSettings();
      }

      if (!vapidPublicKey) throw new SettingsRequestError("push_refused");
      const subscription = await subscribeHere(vapidPublicKey);
      if (!subscription) throw new SettingsRequestError("push_refused");

      try {
        return await store(subscription.endpoint, () => postPushSubscription(subscription));
      } catch (failure) {
        // The platform handed back a subscription another account already owns — a shared browser,
        // where a `PushSubscription` outlives the sign-out of whoever made it. Trading it for a
        // fresh endpoint is the whole repair, and it is attempted exactly once.
        if (!(failure instanceof SettingsRequestError) || failure.code !== "subscription_taken") {
          throw failure;
        }
        const fresh = await resubscribeHere(vapidPublicKey);
        if (!fresh) throw new SettingsRequestError("push_refused");
        return store(fresh.endpoint, () => postPushSubscription(fresh));
      }
    },
  });

  /**
   * Post a subscription and remember which endpoint this browser now answers to.
   *
   * Both halves matter after a re-subscribe: the fingerprint is what makes the row read "on in this
   * browser", and the endpoint is what "forget the others" has to name in order to spare it. A
   * stale endpoint here would make that button delete the row it was meant to keep.
   */
  async function store(
    endpoint: string,
    send: () => Promise<ChannelSettingsView>,
  ): Promise<ChannelSettingsView> {
    const view = await send();
    localEndpoint.current = endpoint;
    setLocalFingerprint(await pushFingerprint(endpoint));
    return view;
  }

  const forgetDevices = useMutation({
    // "The others", never all of them: this browser's own row is what the switch above controls.
    mutationFn: () => deletePushSubscription({ scope: "others", endpoint: localEndpoint.current }),
    ...optimisticUpdate<ChannelSettingsView, void>(settingsKey, (previous) => {
      const base = previous ?? initial;
      const mine = base.push.fingerprints.filter((f) => f === localFingerprint);
      return {
        ...base,
        push: {
          ...base.push,
          configured: mine.length > 0,
          enabled: mine.length > 0,
          fingerprints: mine,
        },
      };
    }),
  });

  // `optimisticUpdate` owns onMutate/onError/onSettled, so this surface's own error state is kept
  // here rather than by overriding them — the same arrangement as `use-brief.ts`.
  function run<T>(mutation: {
    mutate: (vars: T, options: { onError: (failure: unknown) => void }) => void;
  }) {
    return (vars: T) => {
      setError(null);
      mutation.mutate(vars, { onError: (failure) => setError(errorCodeOf(failure)) });
    };
  }

  const setPush = (on: boolean) => {
    setError(null);
    // The row reads its new state in the same frame — while the permission prompt is still open,
    // which is a question the browser owns and can hold for a minute — and goes back if the answer
    // is no. `onSettled` drops the overlay and the derived answer takes over.
    setPushPending(on);
    push.mutate(on, {
      onError: (failure) => setError(errorCodeOf(failure)),
      onSettled: async () => {
        setPushPending(null);
        await client.invalidateQueries({ queryKey: settingsKey });
      },
    });
  };

  // What this browser holds, read once on mount — and nothing else.
  //
  // There used to be a repair here: if the account had no push rows and the browser held a
  // subscription, this posted it. That was a write with no user behind it, and on a shared browser
  // it silently moved the previous person's push channel to whoever opened the page next, because
  // a `PushSubscription` belongs to a browser and an origin and survives a sign-out. The account
  // that owns a subscription is now only ever decided by somebody reaching for the switch.
  //
  // Losing the repair costs nothing, because the page no longer guesses: an unrecognised
  // subscription reads as "off in this browser", and turning it on performs the same write the
  // effect used to perform behind everyone's back.
  useEffect(() => {
    let live = true;
    void (async () => {
      const subscription = await currentSubscription();
      if (!live || !subscription) return;
      localEndpoint.current = subscription.endpoint;
      const fingerprint = await pushFingerprint(subscription.endpoint);
      if (live) setLocalFingerprint(fingerprint);
    })();
    return () => {
      live = false;
    };
  }, []);

  /**
   * Whether push is on *in this browser*, as a fact rather than a guess: the account's push rows
   * arrive as fingerprints, and this is whether one of them is the endpoint this browser holds.
   * `pushPending` overlays it only while a mutation is in flight.
   */
  const pushHere =
    pushPending ??
    (localFingerprint !== null && settings.push.fingerprints.includes(localFingerprint));

  return {
    settings,
    pushHere,
    /** How many *other* browsers the account is subscribed on. */
    pushElsewhere: settings.push.fingerprints.filter((f) => f !== localFingerprint).length,
    error,
    clearError: () => setError(null),
    /** For a mutation this hook does not own — minting a Telegram link lives in its own component. */
    reportError: setError,
    setChannel: (body: ChannelPatch) => run<ChannelPatch>(patch)(body),
    setQuiet: (quiet: QuietView | null) => run<ChannelPatch>(patch)({ quiet }),
    setPaused: (paused: boolean) => run<ChannelPatch>(patch)({ paused }),
    disconnectTelegram: () => run<void>(disconnect)(undefined),
    setPush,
    forgetOtherDevices: () => run<void>(forgetDevices)(undefined),
  };
}

export type SettingsController = ReturnType<typeof useSettings>;
