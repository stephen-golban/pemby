"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useId } from "react";
import type { ChannelSettingsView } from "@/app/api/channels/_lib/view";
import { Ledger } from "@/app/profile/_shared/fields";
import fields from "@/app/profile/_shared/fields.module.css";
import panels from "@/app/profile/_shared/panels.module.css";
import {
  ChannelRow,
  PausePanel,
  PushRow,
  QuietHours,
  QuietWrapNote,
  Switch,
  TelegramConnectButton,
  TelegramLinkPanel,
} from "@/components/settings";
import { useSettings } from "./_shared/use-settings";
import { useTelegramLink } from "./_shared/use-telegram-link";
import styles from "./settings.module.css";

/**
 * `/settings` — the channels a match arrives on, the hours it will not, and the switch that holds
 * everything (PLAN D8).
 *
 * One column, not the rail layout `/profile` uses, because there is nothing to put beside the
 * ledger: every line on this page is a decision, and a sparse column next to them would be
 * decoration. Same ledger grammar, same rows, same pills.
 *
 * There is no Save button. Every switch writes optimistically and rolls back with its reason
 * (`_shared/use-settings.ts`, PLAN D20).
 */
export function SettingsClient({
  initial,
  accountEmail,
  vapidPublicKey,
}: {
  /** Null for an anonymous session: there is no account to deliver to yet (PLAN D4). */
  initial: ChannelSettingsView | null;
  accountEmail: string;
  vapidPublicKey: string | null;
}) {
  if (!initial) return <NeedsAccount />;
  return <Channels initial={initial} accountEmail={accountEmail} vapidPublicKey={vapidPublicKey} />;
}

/**
 * An anonymous visitor (PLAN D4) has a CV and a profile but no account, and the account is deleted
 * with the CV after 24 hours. Binding a Telegram chat or a mailbox to it would promise something it
 * cannot keep, so the page says what is missing rather than showing switches that would be thrown
 * away overnight.
 */
function NeedsAccount() {
  const t = useTranslations("Settings");
  return (
    <div className={styles.column}>
      <header className={styles.intro}>
        <h1 className={styles.title}>{t("title")}</h1>
        <p className={styles.lead}>{t("lead")}</p>
      </header>
      <section className={panels.card} aria-labelledby="settings-account-title">
        <h2 id="settings-account-title" className={panels.cardTitle}>
          {t("anonymous.title")}
        </h2>
        <p className={panels.body}>{t("anonymous.body")}</p>
        <div className={panels.cardActions}>
          <Link className={panels.primary} href="/sign-up">
            {t("anonymous.cta")}
          </Link>
          <Link className={panels.textLink} href="/sign-in">
            {t("anonymous.signIn")}
          </Link>
        </div>
      </section>
    </div>
  );
}

function Channels({
  initial,
  accountEmail,
  vapidPublicKey,
}: {
  initial: ChannelSettingsView;
  accountEmail: string;
  vapidPublicKey: string | null;
}) {
  const t = useTranslations("Settings");
  const errors = useTranslations("Settings.errors");
  const dead = useTranslations("Settings.dead");
  const controller = useSettings(initial, vapidPublicKey);
  const { settings } = controller;
  const telegramLink = useTelegramLink(controller.reportError);

  const channelsId = useId();
  const whenId = useId();

  const telegram = settings.telegram;
  const email = settings.email;

  return (
    <div className={styles.column}>
      <header className={styles.intro}>
        <h1 className={styles.title}>{t("title")}</h1>
        <p className={styles.lead}>{t("lead")}</p>
      </header>

      {controller.error ? (
        <p className={styles.alert} role="alert">
          {errors(controller.error)}
        </p>
      ) : null}

      <section className={styles.topic} aria-labelledby={channelsId}>
        <h2 id={channelsId} className={styles.topicTitle}>
          {t("channels")}
        </h2>

        <Ledger labelledBy={channelsId}>
          <ChannelRow
            id="settings-telegram"
            label={t("telegram.label")}
            state={
              telegram.dead
                ? t("telegram.stopped")
                : telegram.configured
                  ? t("telegram.connected")
                  : t("telegram.notConnected")
            }
            help={t("telegram.help")}
            note={telegram.dead ? dead(telegram.dead) : undefined}
            action={
              telegram.configured && !telegram.dead ? (
                <div className={fields.addRow}>
                  <Switch
                    on={telegram.enabled}
                    labelledBy="settings-telegram"
                    onChange={(on) => controller.setChannel({ telegram: on })}
                  />
                  <button
                    type="button"
                    className={fields.pill}
                    onClick={() => controller.disconnectTelegram()}
                  >
                    {t("telegram.disconnect")}
                  </button>
                </div>
              ) : (
                <TelegramConnectButton minting={telegramLink.minting} onClick={telegramLink.mint} />
              )
            }
            full={
              telegramLink.link && !telegram.configured ? (
                <TelegramLinkPanel link={telegramLink.link} />
              ) : undefined
            }
          />

          <ChannelRow
            id="settings-email"
            label={t("email.label")}
            state={email.address ?? accountEmail}
            help={t("email.help")}
            note={email.dead ? dead(email.dead) : undefined}
            action={
              <Switch
                on={email.enabled}
                labelledBy="settings-email"
                onChange={(on) => controller.setChannel({ email: on })}
              />
            }
          />

          <PushRow
            here={controller.pushHere}
            elsewhere={controller.pushElsewhere}
            available={vapidPublicKey !== null}
            onChange={controller.setPush}
            onForgetDevices={controller.forgetOtherDevices}
          />
        </Ledger>

        <p className={styles.footnote}>{t("footnote")}</p>
      </section>

      <section className={styles.topic} aria-labelledby={whenId}>
        <h2 id={whenId} className={styles.topicTitle}>
          {t("when")}
        </h2>
        <Ledger labelledBy={whenId}>
          <QuietHours
            quiet={settings.quiet}
            hasChannels={settings.hasChannels}
            onChange={controller.setQuiet}
          />
        </Ledger>
        <QuietWrapNote quiet={settings.quiet} />
      </section>

      <div className={styles.account}>
        <PausePanel pausedAt={settings.pausedAt} onChange={controller.setPaused} />
        <p className={styles.links}>
          <Link className={panels.textLink} href="/brief">
            {t("toBrief")}
          </Link>
          <Link className={panels.textLink} href="/profile">
            {t("toProfile")}
          </Link>
        </p>
      </div>
    </div>
  );
}
