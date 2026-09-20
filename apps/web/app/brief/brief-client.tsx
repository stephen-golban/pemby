"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useId } from "react";
import type { BriefView, MatchState, PassReason } from "@/app/api/brief/_lib/view";
import {
  HeldNote,
  MatchRow,
  NearMissGroups,
  ProgramSteps,
  ShownSettings,
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
 * Three states, one page, and the same ledger grammar in all of them:
 *
 * 1. **Matches.** Each one leads with who can hire you and why, then how recently the post was
 *    seen live, then what fits and the one thing that does not.
 * 2. **Honest silence.** Nothing cleared the bar, said plainly on an outlined paper card, then the
 *    near misses grouped by what blocked them with a one-tap fix on the two that a setting opens,
 *    then — for an intern or junior — the programs calendar's next real step.
 * 3. **Both**, when there is some of each: the matches first, the near misses as their own section
 *    underneath.
 *
 * A fourth thing can be true alongside any of them: matches Pemby has found and is not due to
 * deliver yet (PLAN D13). They are counted, never named, and when they are all there is the page
 * says that rather than claiming nothing cleared the bar — the silence card is for the days the
 * answer really is nothing, and it would be a lie on a day with three matches waiting.
 *
 * Silence is the common case on today's data, and it is designed as an answer rather than as an
 * empty state. Every action is optimistic and rolls back with its reason (`_shared/use-brief.ts`).
 */
export function BriefClient({ initial }: { initial: BriefView }) {
  const t = useTranslations("Brief");
  const settings = useTranslations("Settings");
  const countryName = useCountryName();
  const brief = useBrief(initial);
  const data = brief.brief;

  const introId = useId();
  const railId = useId();
  const nearMissId = useId();
  const handledId = useId();
  const programsId = useId();

  // One clock for the whole page, stamped by the server when it read the Brief: the first paint
  // and the hydrated markup then agree on every "seen live 3h ago".
  const now = Date.parse(data.readAt);
  const country = countryName(data.country) ?? t("yourCountry");
  const open = data.matches.filter((match) => OPEN_STATES.includes(match.state));
  const handled = data.matches.filter((match) => !OPEN_STATES.includes(match.state));
  const held = data.held;
  // Nothing to show and nothing on the way: the one state the silence card is the true answer to.
  const silent = open.length === 0 && held.count === 0;

  const actions = {
    setState: (matchId: string, state: MatchState, passReason?: PassReason) =>
      brief.setMatchState({ matchId, state, passReason }),
    flag: (jobId: string, choice: FlagChoice) => brief.flagJob({ jobId, ...choice }),
  };

  // One object, read by the fix pills and by the rail's switches, so the two can never disagree
  // about which settings are currently in force.
  const shown = {
    includeYellow: data.includeYellow,
    hideNoSalary: data.hideNoSalary,
    scoreFloor: data.scoreFloor,
  };

  const nearMisses = data.nearMisses.length > 0 && (
    <NearMissGroups
      groups={data.nearMisses}
      state={shown}
      onFix={brief.setPreferences}
      settle={silent}
    />
  );

  return (
    <div className={styles.layout} aria-busy={brief.pending}>
      <div className={styles.main}>
        <header className={styles.intro}>
          <h1 id={introId} className={styles.title}>
            {t("title")}
          </h1>
          <p className={styles.lead}>
            {data.country ? t("lead", { country }) : t("leadNoCountry")}
          </p>
        </header>

        {brief.error ? (
          <p className={styles.alert} role="alert">
            {t(`errors.${brief.error}`)}
          </p>
        ) : null}

        {brief.failed ? (
          <p className={styles.alert} role="alert">
            {t("failed")}{" "}
            <button type="button" className={styles.textAction} onClick={brief.retry}>
              {t("retry")}
            </button>
          </p>
        ) : null}

        {held.count > 0 && open.length === 0 ? (
          <HeldNote count={held.count} nextAt={held.nextAt} now={now} lead />
        ) : null}

        {silent ? (
          /* The honest-silence card: the one outlined paper card in the system, and the one place
             on this page that carries the signature settle (DESIGN.md). */
          <section className={styles.silence} aria-labelledby={`${introId}-silence`}>
            <h2 id={`${introId}-silence`} className={styles.silenceTitle}>
              {t("silence.title")}
            </h2>
            <p className={styles.silenceBody}>
              {data.country ? t("silence.body", { country }) : t("silence.bodyNoCountry")}
            </p>
            {data.nearMisses.length > 0 ? (
              <>
                <p className={styles.silenceLead}>{t("silence.closest")}</p>
                {nearMisses}
              </>
            ) : (
              <p className={styles.silenceBody}>{t("silence.empty")}</p>
            )}
          </section>
        ) : open.length > 0 ? (
          <section className={styles.matches} aria-labelledby={introId}>
            <ul className={styles.list} aria-label={t("match.listLabel")}>
              {open.map((match) => (
                <MatchRow
                  key={match.matchId}
                  match={match}
                  country={country}
                  now={now}
                  actions={actions}
                  pending={brief.pending}
                />
              ))}
            </ul>
            {held.count > 0 ? (
              <HeldNote count={held.count} nextAt={held.nextAt} now={now} lead={false} />
            ) : null}
          </section>
        ) : null}

        {!silent && data.nearMisses.length > 0 ? (
          <section className={styles.topic} aria-labelledby={nearMissId}>
            <h2 id={nearMissId} className={styles.topicTitle}>
              {t("sections.nearMiss")}
            </h2>
            <p className={styles.topicLead}>{t("sections.nearMissLead")}</p>
            {nearMisses}
          </section>
        ) : null}

        {silent && data.programs.length > 0 ? (
          <section className={styles.topic} aria-labelledby={programsId}>
            <h2 id={programsId} className={styles.topicTitle}>
              {t("programs.title")}
            </h2>
            <p className={styles.topicLead}>
              {data.country ? t("programs.lead", { country }) : t("programs.leadNoCountry")}
            </p>
            <ProgramSteps steps={data.programs} />
          </section>
        ) : null}

        {handled.length > 0 ? (
          <section className={styles.topic} aria-labelledby={handledId}>
            <h2 id={handledId} className={styles.topicTitle}>
              {t("sections.handled")}
            </h2>
            <p className={styles.topicLead}>{t("sections.handledLead")}</p>
            <ul className={styles.list}>
              {handled.map((match) => (
                <MatchRow
                  key={match.matchId}
                  match={match}
                  country={country}
                  now={now}
                  actions={actions}
                  pending={brief.pending}
                />
              ))}
            </ul>
          </section>
        ) : null}
      </div>

      <aside className={styles.rail} aria-labelledby={railId}>
        <div className={styles.count}>
          <h2 id={railId} className={styles.countLabel}>
            {t("rail.count", { count: open.length })}
          </h2>
          {/* Without this line "Nothing on the table" would be false on a day with matches
              waiting on the 24-hour delay. */}
          {held.count > 0 ? (
            <p className={styles.note}>{t("rail.held", { count: held.count })}</p>
          ) : null}
          <p className={styles.note}>{t("rail.note")}</p>
        </div>

        <ShownSettings {...shown} country={country} onChange={brief.setPreferences} />

        {/* The three places this page can send you. Grouped, because the rail's own gap is sized
            for whole blocks and three links spaced that far apart read as three unfinished
            sections rather than one short list.

            `/tracker` is new in phase 09: the board reads `applications`, which "Apply" on a row
            now writes, and without this link the page is reachable only by typing its address. */}
        <nav className={styles.railLinks} aria-label={t("rail.links")}>
          <Link className={styles.railLink} href="/profile">
            {t("rail.profile")}
          </Link>
          <Link className={styles.railLink} href="/tracker">
            {t("rail.tracker")}
          </Link>
          <Link className={styles.railLink} href="/settings">
            {settings("railLink")}
          </Link>
        </nav>
      </aside>
    </div>
  );
}
