"use client";

import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import type { TelegramLink } from "@/app/api/channels/_lib/view";
import { errorCodeOf, postTelegramLink, type SettingsClientError } from "./api";

/**
 * Minting the Telegram deep link, kept out of the query cache on purpose.
 *
 * The URL carries the whole credential — whoever opens it binds their chat to this account — so it
 * is held in component state for as long as the person is looking at it and nowhere else. It is
 * never cached, never refetched, and never recoverable: asking again mints a new token and retires
 * the one on screen.
 *
 * A hook rather than one component because the link needs to be drawn in two places at once: the
 * action pill sits in the ledger row's last column, and the panel showing the URL has to span the
 * whole row — a long URL squeezed into a pill-sized column is unreadable and unselectable.
 */
export function useTelegramLink(onError: (code: SettingsClientError) => void) {
  const [link, setLink] = useState<TelegramLink | null>(null);

  const mint = useMutation({
    mutationFn: postTelegramLink,
    onSuccess: setLink,
    onError: (failure) => onError(errorCodeOf(failure)),
  });

  return {
    link,
    minting: mint.isPending,
    mint: () => mint.mutate(),
    dismiss: () => setLink(null),
  };
}
