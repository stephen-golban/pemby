"use client";

import { useFormatter, useNow, useTranslations } from "next-intl";
import type { OpenRouterController } from "@/app/settings/_shared/use-openrouter";
import { OPENROUTER_KEYS_URL, openRouterKeysUrl } from "@/app/settings/_shared/openrouter-api";
import fields from "@/app/profile/_shared/fields.module.css";
import { ChannelRow } from "./channel-row";
import styles from "./channels.module.css";

/**
 * "Your own AI key" — one ledger row, in the same grammar as the channels above it.
 *
 * It borrows `ChannelRow` rather than growing its own row, because it is the same object: a thing
 * that is connected or is not, a line saying which, and an action in the last column. The one
 * difference is what goes under it, and `ChannelRow` already has a full-width slot for exactly
 * that — the Telegram deep link uses it for the same reason this does.
 *
 * **The copy on this row has one job the rest of the page does not: to stop a person believing
 * Pemby can revoke their key.** It cannot. Pemby is given an inference key, and revoking one needs
 * a management key on the owner's own account. So the row says so while the key is connected, not
 * only afterwards, and the panel that appears after a disconnect says it again with the link to the
 * page where it can actually be done. Nothing here uses the word "revoked" about anything Pemby did.
 */
export function OpenRouterRow({ controller }: { controller: OpenRouterController }) {
  const t = useTranslations("Settings.openrouter");
  const errors = useTranslations("Settings.openrouterErrors");
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });

  const { key } = controller;

  /**
   * `relativeTime` reads a timestamp from a few seconds ago as being in the future, because `now`
   * was captured before it happened. Under a minute, say what a person would say.
   */
  const ago = (iso: string): string =>
    now.getTime() - new Date(iso).getTime() < 60_000
      ? t("justNow")
      : format.relativeTime(new Date(iso), now);

  const state = key.connected
    ? t("connected")
    : controller.connecting
      ? t("opening")
      : t("notConnected");

  return (
    <ChannelRow
      id="settings-openrouter"
      label={t("label")}
      state={state}
      help={key.connected ? t("helpConnected") : t("help")}
      note={
        controller.error !== null ? (
          <>
            {errors(controller.error)}
            {/* Only when the failure happened at OpenRouter's end of the flow: a key may have been
                created on their account and Pemby did not keep it, so say where it is. */}
            {controller.fromCallback ? (
              <>
                {` ${t("strandedKey")} `}
                <a
                  className={styles.inlineLink}
                  href={OPENROUTER_KEYS_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t("keysPage")}
                </a>
              </>
            ) : null}
          </>
        ) : controller.justConnected && key.connected ? (
          t("justConnected")
        ) : controller.checked && key.connected ? (
          t("checkedOk")
        ) : key.connected && key.connectedAt !== null ? (
          <>
            {t("since", {
              when: format.dateTime(new Date(key.connectedAt), { dateStyle: "medium" }),
            })}{" "}
            {key.lastUsedAt === null
              ? t("neverUsed")
              : t("lastUsed", { when: ago(key.lastUsedAt) })}
            {key.label === null ? null : ` ${t("named", { label: key.label })}`}
          </>
        ) : undefined
      }
      action={
        key.connected ? (
          <div className={fields.addRow}>
            <button
              type="button"
              className={fields.pill}
              aria-describedby="settings-openrouter"
              disabled={controller.checking}
              onClick={controller.check}
            >
              {controller.checking ? t("checking") : t("check")}
            </button>
            <button
              type="button"
              className={fields.pill}
              aria-describedby="settings-openrouter"
              onClick={controller.disconnect}
            >
              {t("disconnect")}
            </button>
          </div>
        ) : (
          <button
            type="button"
            className={fields.pill}
            aria-describedby="settings-openrouter"
            disabled={controller.connecting}
            onClick={controller.connect}
          >
            {controller.connecting ? t("opening") : t("connect")}
          </button>
        )
      }
      full={
        key.connected && key.keyHash !== null ? (
          <ManagePanel hash={key.keyHash} />
        ) : controller.revoked !== null ? (
          <RevokePanel hash={controller.revoked} onDismiss={controller.dismissRevoked} />
        ) : undefined
      }
    />
  );
}

/**
 * While the key is connected: where it lives and who can end it.
 *
 * Said now rather than only at disconnect, because the person deciding whether to connect their
 * own account is entitled to know the shape of the arrangement before they are inside it.
 */
function ManagePanel({ hash }: { hash: string }) {
  const t = useTranslations("Settings.openrouter");
  return (
    <div className={styles.link}>
      <p className={styles.linkLead}>{t("manageLead")}</p>
      <div className={styles.linkActions}>
        <a
          className={fields.pill}
          href={openRouterKeysUrl(hash)}
          target="_blank"
          rel="noopener noreferrer"
        >
          {t("manage")}
        </a>
      </div>
    </div>
  );
}

/**
 * After a disconnect: the sentence this whole feature turns on.
 *
 * Pemby's copy is gone; the key is not. It is still live on the person's OpenRouter account and
 * only they can end it, so this panel exists to hand them the link while they are still looking at
 * the screen — the hash it is built from was on the row a moment ago and is not on the server any
 * more. Dismissing it is a deliberate act, because it cannot be brought back.
 */
function RevokePanel({ hash, onDismiss }: { hash: string; onDismiss: () => void }) {
  const t = useTranslations("Settings.openrouter");
  return (
    <div className={styles.link}>
      <p className={styles.linkLead}>{t("revokeLead")}</p>
      <div className={styles.linkActions}>
        <a
          className={fields.pill}
          href={openRouterKeysUrl(hash)}
          target="_blank"
          rel="noopener noreferrer"
        >
          {t("revoke")}
        </a>
        <button type="button" className={fields.pill} onClick={onDismiss}>
          {t("revokeDone")}
        </button>
      </div>
      <p className={styles.note}>{t("revokeNote")}</p>
    </div>
  );
}
