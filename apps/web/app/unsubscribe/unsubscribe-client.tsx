"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import styles from "./unsubscribe.module.css";

type State = "idle" | "done" | "failed";

/**
 * The confirm button, and the only mutation on this page.
 *
 * Optimistic, as every mutation in this app is (docs/conventions.md): the screen says "done" the
 * moment the button is pressed and falls back to the failure line if the POST does not come back
 * 200. There is no query cache to snapshot here — the page holds one boolean — so this is the
 * `useOptimistic` half of that rule rather than the TanStack half.
 *
 * The token travels in the URL and never in a body, because the URL is what the `List-Unsubscribe`
 * header carries and one shape for both paths means one thing to get wrong. The body is the
 * `List-Unsubscribe=One-Click` pair RFC 8058 defines, sent here too so that this button and a
 * mailbox provider's own button are the same request.
 */
export function UnsubscribeConfirm({ token }: { token: string }) {
  const t = useTranslations("Delivery.unsubscribe");
  const [state, setState] = useState<State>("idle");
  const [optimistic, setOptimistic] = useOptimistic<State, State>(state, (_, next) => next);
  const [pending, startTransition] = useTransition();

  function stop() {
    startTransition(async () => {
      setOptimistic("done");
      const response = await fetch(`/api/unsubscribe?t=${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: "List-Unsubscribe=One-Click",
      }).catch(() => null);
      setState(response?.ok ? "done" : "failed");
    });
  }

  if (optimistic === "done") {
    return (
      <>
        <h1 className={styles.title}>{t("done")}</h1>
        <p className={styles.lead}>{t("doneLead")}</p>
        <p className={styles.links}>
          <Link href="/settings">{t("settings")}</Link>
          <Link href="/brief">{t("brief")}</Link>
        </p>
      </>
    );
  }

  return (
    <>
      <h1 className={styles.title}>{t("title")}</h1>
      <p className={styles.lead}>{t("lead")}</p>
      <button type="button" className={styles.confirm} onClick={stop} disabled={pending}>
        {pending ? t("working") : t("confirm")}
      </button>
      {optimistic === "failed" ? <p className={styles.error}>{t("failed")}</p> : null}
      <p className={styles.links}>
        <Link href="/settings">{t("settings")}</Link>
        <Link href="/brief">{t("brief")}</Link>
      </p>
    </>
  );
}
