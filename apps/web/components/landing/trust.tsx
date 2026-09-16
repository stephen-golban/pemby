import { getTranslations } from "next-intl/server";
import s from "./sections.module.css";
import styles from "./trust.module.css";

const ROWS = [
  { key: "b2b", tier: "green" },
  { key: "eor", tier: "yellow" },
  { key: "visa", tier: "white" },
  { key: "local", tier: "red" },
] as const;

const TIERS = ["green", "yellow", "white", "red"] as const;
const LOG = ["one", "two", "three"] as const;

/** A loose hand-drawn double underline, the kind of mark a person leaves on a printout. Decorative only. */
function HandUnderline() {
  return (
    <svg className={styles.underline} viewBox="0 0 62 13" aria-hidden="true" focusable="false">
      <path
        d="M2.5 5.6c9.8-2.3 30.4-3.9 57.2-1.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M9 10.4c13.6-1.9 29.7-2.2 43.5-.9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Why a match can be trusted: eligibility per country and per way of working with the reason
 * shown, and live re-verification at the source. Both specimens are labelled examples.
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
        <figure className={styles.panel}>
          <figcaption className={styles.caption}>
            <span className={s.example}>{t("example")}</span>
            <span>{t("tableCaption")}</span>
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
              {ROWS.map(({ key, tier }) => (
                <tr key={key}>
                  <th scope="row">{t(`rows.${key}.way`)}</th>
                  <td>
                    <span className={styles.verdict} data-tier={tier}>
                      <span className={styles.swatch} aria-hidden="true" />
                      {t(`rows.${key}.verdict`)}
                    </span>
                  </td>
                  <td className={styles.reason}>{t(`rows.${key}.reason`)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </figure>

        <div className={styles.tiers}>
          <h3 className={styles.tiersTitle}>{t("tiersTitle")}</h3>
          <dl className={styles.tierList}>
            {TIERS.map((tier) => (
              <div key={tier} className={styles.tierRow}>
                <dt className={styles.verdict} data-tier={tier}>
                  <span className={styles.swatch} aria-hidden="true" />
                  {t(`tiers.${tier}.name`)}
                </dt>
                <dd>{t(`tiers.${tier}.who`)}</dd>
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
        <figure className={styles.log}>
          <figcaption className={styles.caption}>
            <span className={s.example}>{t("example")}</span>
            <span>{t("logCaption")}</span>
          </figcaption>
          <ol className={styles.logList}>
            {LOG.map((entry) => (
              <li
                key={entry}
                className={styles.logRow}
                data-closed={entry === "three" || undefined}
              >
                <span className={styles.logTime}>{t(`log.${entry}.time`)}</span>
                <span className={styles.logState}>
                  {t(`log.${entry}.state`)}
                  {entry === "three" ? <HandUnderline /> : null}
                </span>
                <span className={styles.logNote}>{t(`log.${entry}.note`)}</span>
              </li>
            ))}
          </ol>
        </figure>
      </div>
    </section>
  );
}
