"use client";

import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";
import { useCallback, useRef, useState } from "react";
import { authClient } from "@/lib/auth/client";
import { CvRequestError } from "./api";

const TOKEN_TIMEOUT_MS = 20_000;
const POLL_MS = 50;

/** Turnstile action per submission kind, so Cloudflare analytics can tell the two apart. */
export type HumanAction = "cv_upload" | "cv_text";

/**
 * Cloudflare Turnstile for the CV drop. The widget mounts on the first sign of intent (pointer over
 * the zone, focus, a drag, or the drop itself), so visitors who never reach for the drop never load
 * Cloudflare's script, and by the time a file lands a token is usually waiting. It stays invisible
 * unless Cloudflare needs an interaction, in which case it appears inside the zone.
 *
 * Tokens are single-use: every submission takes a fresh one and resets the widget afterwards.
 */
export function useHumanCheck(siteKey: string) {
  const [mounted, setMounted] = useState(false);
  const [interactive, setInteractive] = useState(false);
  const [action, setAction] = useState<HumanAction>("cv_upload");
  const actionRef = useRef<HumanAction>("cv_upload");
  const held = useRef<{ action: HumanAction; value: string } | null>(null);
  const instance = useRef<TurnstileInstance | null>(null);
  const failed = useRef(false);

  const warm = useCallback(() => setMounted(true), []);

  const token = useCallback(async (next: HumanAction): Promise<string> => {
    setMounted(true);
    if (actionRef.current !== next) {
      actionRef.current = next;
      held.current = null;
      setAction(next);
    }
    const deadline = Date.now() + TOKEN_TIMEOUT_MS;
    for (;;) {
      const current = held.current;
      if (current && current.action === next) return current.value;
      if (failed.current || Date.now() > deadline) throw new CvRequestError("turnstile_failed", 0);
      await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    }
  }, []);

  /** After a submit: drop the used token and start the next one. */
  const consumed = useCallback(() => {
    held.current = null;
    instance.current?.reset();
  }, []);

  // `key` forces a fresh widget when the action changes; the widget carries the action it solved.
  const widget = mounted ? (
    <Turnstile
      key={action}
      ref={instance}
      siteKey={siteKey}
      options={{
        action,
        appearance: "interaction-only",
        size: "flexible",
        refreshExpired: "auto",
      }}
      scriptOptions={{
        onError: () => {
          failed.current = true;
        },
      }}
      onSuccess={(value) => {
        held.current = { action: actionRef.current, value };
      }}
      onExpire={() => {
        held.current = null;
      }}
      onError={() => {
        held.current = null;
      }}
      onBeforeInteractive={() => setInteractive(true)}
      onAfterInteractive={() => setInteractive(false)}
    />
  ) : null;

  return { warm, token, consumed, widget, interactive };
}

/** An anonymous session unless the visitor already has one (phase 06 contract, flow step 1). */
export async function ensureSession(): Promise<void> {
  const current = await authClient.getSession().catch(() => null);
  if (current?.data?.session) return;
  const { error } = await authClient.signIn.anonymous();
  if (error) {
    throw new CvRequestError(
      error.status === 429 ? "rate_limited" : "unauthenticated",
      error.status,
    );
  }
}
