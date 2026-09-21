"use client";

import { FRESHNESS_HOURS } from "@pemby/core";
import { useFormatter, useTranslations } from "next-intl";
import { useId } from "react";
import type { BriefView, MatchState, PassReason } from "@/app/api/brief/_lib/view";
import {
  HeldNote,
  MatchCard,
  NearMissCard,
  ProgramSteps,
  ShownSettings,
  TierLegend,
  type FlagChoice,
} from "@/components/brief";
import { useCountryName } from "@/components/profile";
import { useBrief } from "./_shared/use-brief";
import styles from "./brief.module.css";

/** States still waiting on a decision. Applied and passed ones move down to "Already handled". */
const OPEN_STATES: readonly MatchState[] = ["new", "saved"];

/**
 * The Brief (PLAN D6, D7).
 *
 * One column on the white sheet. The day's answer is the first thing on the page, set at poster
 * scale in heavy near-black, with the date and the freshness line beneath it; everything under that
 * is a white card. There is no feed and no search, and nothing is ever filled in to look busy.
 *
 * Three states, one page, and the same sentence at the top of all of them:
 *
 * 1. **Matches.** Each card leads with the tier's own marker and who can hire you, then why it
 *    fits, then the one thing it does not, then the act.
 * 2. **Honest silence.** Nothing cleared the bar, said plainly, then the near misses grouped by
 *    what blocked them with a one-tap fix on the two that a setting opens, then — for an intern or
 *    junior — the programs calendar's next real step.
 * 3. **Held.** Matches Pemby has found and is not due to deliver yet (PLAN D13). They are counted,
 *    never named, and on a day when they are all there is the page says so rather than claiming
 *    nothing cleared the bar.
 *
 * Silence is the common case on today's data, and it is designed as an answer rather than as an
 * empty state. Every action is optimistic and rolls back with its reason (`_shared/use-brief.ts`).
 */
export function BriefClient({ initial }: { initial: BriefView }) {
  const t = useTranslations("Brief");
  const settings = useTranslations("Settings");
  const format = useFormatter();
  const countryName = useCountryName();
  const brief = useBrief(initial);
  const data = brief.brief;

  const handledId = useId();
  const programsId = useId();

  // One clock for the whole page, stamped by the server when it read the Brief: the first paint
  // and the hydrated markup then agree on every "seen live 3h ago" and on today's date.
  const now = Date.parse(data.readAt);
  const country = countryName(data.country) ?? t("yourCountry");
  const open = data.matches.filter((match) => OPEN_STATES.includes(match.state));
  const handled = data.matches.filter((match) => !OPEN_STATES.includes(match.state));
  const held = data.held;
  // Nothing to show and nothing on the way: the one state the silence answer is true for.
  const silent = open.length === 0 && held.count === 0;

  // UTC, not the reader's zone: this page has no configured time zone, and a local rendering would
  // be the server's on the first paint and the browser's a moment later.
  const today = format.dateTime(new Date(data.readAt), {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });

  const headline = silent
    ? t("headline.silence")
    : open.length > 0
      ? data.country
        ? t("headline.matches", { count: open.length, country })
        : t("headline.matchesNoCountry", { count: open.length })
      : t("headline.held", { count: held.count });

  const actions = {
    setState: (matchId: string, state: MatchState, passReason?: PassReason) =>
      brief.setMatchState({ matchId, state, passReason }),
    flag: (jobId: string, choice: FlagChoice) => brief.flagJob({ jobId, ...choice }),
  };

  const nearMisses = data.nearMisses.length > 0 && (
    <NearMissCard
      groups={data.nearMisses}
      includeYellow={data.includeYellow}
      hideNoSalary={data.hideNoSalary}
      onFix={brief.setPreferences}
      settle={silent}
    />
  );

  return (
    <div className={styles.layout} aria-busy={brief.pending}>
      <header className={styles.intro}>
        <h1 className={styles.headline}>{headline}</h1>
        <p className={styles.subline}>{t("subline", { date: today, hours: FRESHNESS_HOURS })}</p>
      </header>

      {brief.error ? (
        <p className={styles.alert} role="alert">
          {t(`errors.${brief.error}`)}
        </p>
      ) : null}

      {brief.failed ? (
        <p className={styles.alert} role="alert">
          {t("failed")}{" "}
          <button type="button" className={styles.retry} onClick={brief.retry}>
            {t("retry")}
          </button>
        </p>
      ) : null}

      {open.length > 0 ? (
        <ul className={styles.stack} aria-label={t("match.listLabel")}>
          {open.map((match, index) => (
            <MatchCard
              key={match.matchId}
              match={match}
              country={country}
              now={now}
              actions={actions}
              pending={brief.pending}
              index={index}
            />
          ))}
        </ul>
      ) : null}

      {held.count > 0 ? (
        <HeldNote count={held.count} nextAt={held.nextAt} now={now} lead={open.length === 0} />
      ) : null}

      {silent ? (
        <div className={styles.answer}>
          <p className={styles.answerBody}>
            {data.country ? t("silence.body", { country }) : t("silence.bodyNoCountry")}
          </p>
          {data.nearMisses.length > 0 ? (
            <p className={styles.answerLead}>{t("silence.closest")}</p>
          ) : (
            <p className={styles.answerBody}>{t("silence.empty")}</p>
          )}
        </div>
      ) : null}

      {data.nearMisses.length > 0 ? <div className={styles.section}>{nearMisses}</div> : null}

      {silent && data.programs.length > 0 ? (
        <section className={styles.section} aria-labelledby={programsId}>
          <div className={styles.sectionHead}>
            <h2 id={programsId} className={styles.sectionTitle}>
              {t("programs.title")}
            </h2>
            <p className={styles.sectionLead}>
              {data.country ? t("programs.lead", { country }) : t("programs.leadNoCountry")}
            </p>
          </div>
          <ProgramSteps steps={data.programs} />
        </section>
      ) : null}

      {handled.length > 0 ? (
        <section className={styles.section} aria-labelledby={handledId}>
          <div className={styles.sectionHead}>
            <h2 id={handledId} className={styles.sectionTitle}>
              {t("sections.handled")}
            </h2>
            <p className={styles.sectionLead}>{t("sections.handledLead")}</p>
          </div>
          <ul className={styles.stack}>
            {handled.map((match, index) => (
              <MatchCard
                key={match.matchId}
                match={match}
                country={country}
                now={now}
                actions={actions}
                pending={brief.pending}
                index={index}
              />
            ))}
          </ul>
        </section>
      ) : null}

      <ShownSettings
        includeYellow={data.includeYellow}
        hideNoSalary={data.hideNoSalary}
        country={country}
        onChange={brief.setPreferences}
        settingsLink={settings("railLink")}
      />

      <div className={styles.legendFoot}>
        <TierLegend country={country} />
      </div>
    </div>
  );
}
