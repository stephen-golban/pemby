"use client";

import { useFormatter, useNow, useTranslations } from "next-intl";
import { useState } from "react";
import type { TelegramLink } from "@/app/api/channels/_lib/view";
import styles from "./channels.module.css";

/** The action in the row's last column: ask for a link. */
export function TelegramConnectButton({
  minting,
  onClick,
}: {
  minting: boolean;
  onClick: () => void;
}) {
  const t = useTranslations("Settings.telegram");
  return (
    <button type="button" className={styles.primary} disabled={minting} onClick={onClick}>
      {minting ? t("minting") : t("connect")}
    </button>
  );
}

/**
 * The minted link, shown once, across the full width of the channels row.
 *
 * Shown as text rather than only as a button on purpose. The person is usually at a desktop and
 * their Telegram is on a phone, so copying the line is the real path through this step — which is
 * also why it needs the whole row: a 78-character URL in a pill-width column is neither readable
 * nor selectable.
 *
 * The block says, in words, both of the things that are true of it: it works once, and asking for
 * another one replaces it. A link that looks permanent is a link people paste into group chats.
 */
export function TelegramLinkPanel({ link }: { link: TelegramLink }) {
  const t = useTranslations("Settings.telegram");
  const format = useFormatter();
  const now = useNow();
  const [copied, setCopied] = useState(false);

  return (
    <div className={styles.link}>
      <p className={styles.linkLead}>{t("linkLead")}</p>
      <p className={styles.linkUrl}>{link.url}</p>
      <div className={styles.linkActions}>
        <a className={styles.primary} href={link.url} target="_blank" rel="noopener noreferrer">
          {t("open")}
        </a>
        <button
          type="button"
          className={styles.pill}
          onClick={() => {
            void navigator.clipboard
              .writeText(link.url)
              .then(() => setCopied(true))
              .catch(() => setCopied(false));
          }}
        >
          {copied ? t("copied") : t("copy")}
        </button>
      </div>
      <p className={styles.linkNote}>
        {t("linkExpires", { when: format.relativeTime(new Date(link.expiresAt), now) })}
      </p>
    </div>
  );
}
