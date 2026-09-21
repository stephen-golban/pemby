import { getTranslations } from "next-intl/server";
import styles from "./trust.module.css";
import { TileMark, type Mark } from "./marks";
import s from "./sections.module.css";

const ROWS = [
  { key: "b2b", tier: "green", mark: "check" },
  { key: "eor", tier: "yellow", mark: "tilde" },
  { key: "visa", tier: "white", mark: "question" },
  { key: "local", tier: "red", mark: "cross" },
] as const satisfies readonly { key: string; tier: string; mark: Mark }[];

const TIERS = [
  { key: "green", mark: "check" },
  { key: "yellow", mark: "tilde" },
  { key: "white", mark: "question" },
  { key: "red", mark: "cross" },
] as const satisfies readonly { key: string; mark: Mark }[];

const LOG = ["one", "two", "three"] as const;

/**
 * Why a match can be trusted: eligibility per country and per way of working with the reason
 * shown, and live re-verification at the source.
 *
 * A verdict is never a colour: every row carries a tier tile with its own mark, a tinted tier pill
 * and the pill's word. Red is a blocker colour only. Both specimens are labelled examples.
 */
export async function Trust() {
  const t = await getTranslations("Landing.trust");

  return (
    <section className={s.section} aria-labelledby="trust-title">
      <h2 id="trust-title" className={s.title}>
        {t("title")}
      </h2>
      <p className={s.intro}>{t("intro")}</p>

      <div className={styles.eligibility}>
        <figure className={`${s.card} ${styles.panel}`}>
          <figcaption className={styles.caption}>
            <span className={s.stamp}>{t("example")}</span>
            <span className={styles.captionText}>{t("tableCaption")}</span>
          </figcaption>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">{t("colWay")}</th>
                <th scope="col">{t("colVerdict")}</th>
                <th scope="col">{t("colReason")}</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map(({ key, tier, mark }) => (
                <tr key={key}>
                  <th scope="row">{t(`rows.${key}.way`)}</th>
                  <td>
                    <span className={styles.verdict}>
                      <span className={`${s.tile} ${styles.rowTile}`} data-accent={tier}>
                        <TileMark mark={mark} className={styles.rowMark} />
                      </span>
                      <span className={s.tierPill} data-tier={tier}>
                        {t(`rows.${key}.verdict`)}
                      </span>
                    </span>
                  </td>
                  <td className={styles.reason}>{t(`rows.${key}.reason`)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </figure>

        <div className={`${s.card} ${styles.tiers}`}>
          <h3 className={styles.tiersTitle}>{t("tiersTitle")}</h3>
          <dl className={styles.tierList}>
            {TIERS.map(({ key, mark }) => (
              <div key={key} className={styles.tierRow}>
                <dt className={styles.tierName}>
                  <span className={`${s.tile} ${styles.rowTile}`} data-accent={key}>
                    <TileMark mark={mark} className={styles.rowMark} />
                  </span>
                  <span className={s.tierPill} data-tier={key}>
                    {t(`tiers.${key}.name`)}
                  </span>
                </dt>
                <dd className={styles.tierWho}>{t(`tiers.${key}.who`)}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      <div className={styles.live}>
        <div className={styles.liveCopy}>
          <h3 className={styles.liveTitle}>{t("liveTitle")}</h3>
          <p className={styles.liveBody}>{t("liveBody")}</p>
        </div>
        <figure className={`${s.card} ${styles.log}`}>
          <figcaption className={styles.caption}>
            <span className={s.stamp}>{t("example")}</span>
            <span className={styles.captionText}>{t("logCaption")}</span>
          </figcaption>
          <ol className={styles.logList}>
            {LOG.map((entry) => (
              <li
                key={entry}
                className={styles.logRow}
                data-closed={entry === "three" || undefined}
              >
                <span className={styles.logTime}>{t(`log.${entry}.time`)}</span>
                <span className={styles.logState}>{t(`log.${entry}.state`)}</span>
                <span className={styles.logNote}>{t(`log.${entry}.note`)}</span>
              </li>
            ))}
          </ol>
        </figure>
      </div>
    </section>
  );
}
