"use client";

import { useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { isStandalone, pushAvailability, type PushAvailability } from "@/app/settings/_shared/push";
import { ChannelRow, Switch } from "./channel-row";
import styles from "./channels.module.css";
import { BellMark } from "./marks";

/**
 * The push row, which is the only one of the three that is about *this browser* rather than about
 * the account.
 *
 * What it can say, and why each sentence exists:
 *
 * - **iPhone and iPad.** Safari 16.4 supports the Push API only for a web app saved to the Home
 *   Screen (MDN browser-compat `PushManager.safari_ios`). In a tab there is no `PushManager` at
 *   all, so the row says how to get one instead of offering a switch that would look like it
 *   worked and then never fire. This is the single most important line on the page for the
 *   audience this product is for.
 * - **Blocked.** Notification permission is refused for this site. Only the browser's own settings
 *   can undo that, so the row says so rather than opening a prompt that will not appear.
 *   Re-prompting is not possible; pretending otherwise wastes a tap and some trust.
 * - **No push at all.** An old browser, or one built without a push service.
 * - **Other devices.** Push is stored per browser, so the account can be subscribed somewhere this
 *   person is not sitting. The count is shown, with the one action that a lost device leaves —
 *   forget them all.
 *
 * Availability is a browser fact, not React state, so it is read through `useSyncExternalStore`
 * with a null server snapshot: `navigator` and `Notification` do not exist on the server, and the
 * server's paint says "checking" rather than guessing and taking it back. Nothing here subscribes —
 * a browser does not gain a push service while the page is open — so the subscribe function is a
 * no-op and the snapshot is read once per render, cheaply.
 */

/** No source of change to listen to; `useSyncExternalStore` still wants a stable subscriber. */
const noSubscription = () => () => {};
const serverSnapshot = () => null;
export function PushRow({
  here,
  elsewhere,
  available,
  onChange,
  onForgetDevices,
}: {
  /**
   * Whether push is on in *this* browser. Derived from the account's push fingerprints and the
   * endpoint this browser holds, so it is a fact rather than a guess — a subscription the account
   * has no row for reads as off, which is what it is.
   */
  here: boolean;
  /** How many *other* browsers the account is subscribed on. */
  elsewhere: number;
  /** False when no VAPID public key is configured for this deployment. */
  available: boolean;
  onChange: (on: boolean) => void;
  onForgetDevices: () => void;
}) {
  const t = useTranslations("Settings.push");
  const support = useSyncExternalStore<PushAvailability | null>(
    noSubscription,
    pushAvailability,
    serverSnapshot,
  );
  const installed = useSyncExternalStore(noSubscription, isStandalone, () => false);

  const on = here;

  let state: string;
  let note: string | null = null;
  let control = true;

  if (!available) {
    state = t("unavailableState");
    note = t("unavailable");
    control = false;
  } else if (support === null) {
    // The server's paint, before the browser has been read. Says nothing rather than something it
    // would take back.
    state = t("checking");
    control = false;
  } else if (support === "home-screen") {
    state = t("homeScreenState");
    note = t("homeScreen");
    control = false;
  } else if (support === "unsupported") {
    state = t("unsupportedState");
    note = t("unsupported");
    control = false;
  } else if (support === "denied") {
    state = t("blockedState");
    note = t("blocked");
    control = false;
  } else {
    state = on ? t("onState") : t("offState");
    if (!on && installed) note = t("installed");
  }

  const lines = [note, elsewhere > 0 ? t("elsewhere", { count: elsewhere }) : null].filter(
    (line): line is string => line !== null,
  );

  return (
    <ChannelRow
      id="settings-push"
      accent="green"
      mark={<BellMark className={styles.tileMark} />}
      label={t("label")}
      state={state}
      help={t("help")}
      note={lines.length > 0 ? lines.join(" ") : undefined}
      action={
        <>
          {control ? <Switch on={on} labelledBy="settings-push" onChange={onChange} /> : null}
          {elsewhere > 0 ? (
            <button type="button" className={styles.pill} onClick={onForgetDevices}>
              {t("forget")}
            </button>
          ) : null}
        </>
      }
    />
  );
}
