"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useId } from "react";
import type { CSSProperties } from "react";
import type { ChannelSettingsView } from "@/app/api/channels/_lib/view";
import {
  ChannelRow,
  ClockMark,
  MailMark,
  PausePanel,
  PushRow,
  QuietHours,
  QuietWrapNote,
  Switch,
  TelegramConnectButton,
  TelegramLinkPanel,
  TelegramMark,
} from "@/components/settings";
import channels from "@/components/settings/channels.module.css";
import { useSettings } from "./_shared/use-settings";
import { useTelegramLink } from "./_shared/use-telegram-link";
import styles from "./settings.module.css";

/**
 * `/settings` — the channels a match arrives on, the hours it will not, and the switch that holds
 * everything (PLAN D8).
 *
 * One column on the white sheet: the subject at poster scale with nothing above it, then three
 * white cards stacked evenly — the channels, the quiet window, and the hold. No rail, because there
 * is nothing to put beside a page whose every line is a decision.
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

/** The foot of the page: the two other places this account is changed from. */
function FootLinks() {
  const t = useTranslations("Settings");
  return (
    <p className={styles.links}>
      <Link className={styles.link} href="/brief">
        {t("toBrief")}
      </Link>
      <Link className={`${styles.link} ${styles.linkDivider}`} href="/profile">
        {t("toProfile")}
      </Link>
    </p>
  );
}

/**
 * An anonymous visitor (PLAN D4) has a CV and a profile but no account, and the account is deleted
 * with the CV after 24 hours. Binding a Telegram chat or a mailbox to it would promise something it
 * cannot keep, so the page says what is missing rather than showing switches that would be thrown
 * away overnight.
 */
function NeedsAccount() {
  const t = useTranslations("Settings");
  const titleId = useId();
  return (
    <div className={styles.column}>
      <header className={styles.intro}>
        <h1 className={styles.headline}>{t("title")}</h1>
        <p className={styles.subline}>{t("lead")}</p>
      </header>

      <section className={channels.card} aria-labelledby={titleId}>
        <div className={channels.cardHead}>
          <h2 id={titleId} className={channels.cardTitle}>
            {t("anonymous.title")}
          </h2>
          <p className={channels.cardNote}>{t("anonymous.body")}</p>
        </div>
        <div className={channels.cardActions}>
          <Link className={channels.primary} href="/sign-up">
            {t("anonymous.cta")}
          </Link>
          <Link className={channels.pill} href="/sign-in">
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
        <h1 className={styles.headline}>{t("title")}</h1>
        <p className={styles.subline}>{t("lead")}</p>
      </header>

      {controller.error ? (
        <p className={styles.alert} role="alert">
          {errors(controller.error)}
        </p>
      ) : null}

      <section
        className={channels.card}
        style={{ "--settle-index": 0 } as CSSProperties}
        aria-labelledby={channelsId}
      >
        <div className={channels.cardHead}>
          <h2 id={channelsId} className={channels.cardTitle}>
            {t("channels")}
          </h2>
        </div>

        <ul className={channels.rows}>
          <ChannelRow
            id="settings-telegram"
            accent="blue"
            mark={<TelegramMark className={channels.tileMark} />}
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
            dead={telegram.dead !== null}
            action={
              telegram.configured && !telegram.dead ? (
                <>
                  <Switch
                    on={telegram.enabled}
                    labelledBy="settings-telegram"
                    onChange={(on) => controller.setChannel({ telegram: on })}
                  />
                  <button
                    type="button"
                    className={channels.pill}
                    onClick={() => controller.disconnectTelegram()}
                  >
                    {t("telegram.disconnect")}
                  </button>
                </>
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
            accent="yellow"
            mark={<MailMark className={channels.tileMark} />}
            label={t("email.label")}
            state={email.address ?? accountEmail}
            help={t("email.help")}
            note={email.dead ? dead(email.dead) : undefined}
            dead={email.dead !== null}
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
        </ul>

        <p className={channels.footnote}>{t("footnote")}</p>
      </section>

      <section
        className={channels.card}
        style={{ "--settle-index": 1 } as CSSProperties}
        aria-labelledby={whenId}
      >
        <div className={channels.cardHeadRow}>
          <span className={channels.tile} data-accent="ink">
            <ClockMark className={channels.tileMark} />
          </span>
          <h2 id={whenId} className={channels.cardTitle}>
            {t("when")}
          </h2>
        </div>
        <QuietHours
          quiet={settings.quiet}
          hasChannels={settings.hasChannels}
          onChange={controller.setQuiet}
        />
        <QuietWrapNote quiet={settings.quiet} />
      </section>

      <div style={{ "--settle-index": 2 } as CSSProperties}>
        <PausePanel pausedAt={settings.pausedAt} onChange={controller.setPaused} />
      </div>

      <FootLinks />
    </div>
  );
}
