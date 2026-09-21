import { getTranslations } from "next-intl/server";
import styles from "./match-band.module.css";
import { TileMark } from "./marks";
import s from "./sections.module.css";

const MATCHES = ["platform", "backend", "data"] as const;

/**
 * What a match looks like: three invented roles drawn exactly as the product draws them — a green
 * tier tile with its own mark, the reasons as tag pills, the verdict as a tinted pill and a word —
 * and the honest silence beside them. Every card carries the unmissable EXAMPLE stamp, and the
 * footnote under the row says the same thing in a sentence.
 */
export async function MatchBand() {
  const t = await getTranslations("Landing");
  return (
    <section className={s.section} aria-labelledby="example-matches">
      <h2 id="example-matches" className={s.title}>
        {t("band.title")}
      </h2>
      <p className={s.intro}>{t("band.intro")}</p>

      <ul className={styles.cards}>
        {MATCHES.map((key) => (
          <li key={key}>
            <article className={`${s.card} ${styles.card}`}>
              <div className={styles.head}>
                <span className={s.tile} data-accent="green">
                  <TileMark mark="check" className={s.tileMark} />
                </span>
                <p className={s.stamp}>{t("band.example")}</p>
              </div>
              <h3 className={styles.role}>{t(`cards.${key}.role`)}</h3>
              <p className={styles.meta}>{t(`cards.${key}.meta`)}</p>
              <ul className={styles.criteria} aria-label={t("band.criteriaLabel")}>
                <li className={s.tag}>{t(`cards.${key}.criterion1`)}</li>
                <li className={s.tag}>{t(`cards.${key}.criterion2`)}</li>
              </ul>
              <p className={s.tierPill} data-tier="green">
                {t(`cards.${key}.tag`)}
              </p>
            </article>
          </li>
        ))}

        <li>
          <article className={`${s.card} ${styles.card} ${styles.silence}`}>
            <div className={styles.head}>
              <span className={s.tile} data-accent="ink">
                <TileMark mark="question" className={s.tileMark} />
              </span>
              <p className={s.stamp}>{t("band.example")}</p>
            </div>
            <h3 className={styles.role}>{t("cards.silence.title")}</h3>
            <p className={styles.meta}>{t("cards.silence.body")}</p>
          </article>
        </li>
      </ul>

      <p className={styles.footnote}>{t("band.footnote")}</p>
    </section>
  );
}
