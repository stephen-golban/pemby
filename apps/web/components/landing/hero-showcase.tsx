import { getTranslations } from "next-intl/server";
import Image from "next/image";
import figure from "@/public/landing/hero-binoculars.png";
import styles from "./landing.module.css";
import { LongArrow, TileMark, type Mark } from "./marks";

const ROLES = [
  { key: "backend", accent: "green", mark: "check" },
  { key: "staff", accent: "yellow", mark: "tilde" },
] as const satisfies readonly { key: string; accent: string; mark: Mark }[];

/**
 * The right half of the first viewport: the flat vector figure with two white cards layered over
 * it and over each other — the product's own verdict, shown rather than described.
 *
 * Both cards are invented and both carry the unmissable EXAMPLE stamp. A verdict is a tile, a mark
 * and a word, never a colour on its own, so each role row says what its tier means in text.
 */
export async function HeroShowcase() {
  const t = await getTranslations("Landing.hero");
  return (
    <div className={styles.showcase}>
      <Image
        src={figure}
        alt=""
        className={styles.figure}
        sizes="(max-width: 640px) 60vw, (max-width: 1080px) 44vw, 410px"
        priority
      />

      <article className={`${styles.card} ${styles.verdictCard}`} aria-labelledby="hero-verdict">
        <span className={styles.tile} data-accent="green">
          <TileMark mark="check" className={styles.tileMark} />
        </span>
        <h2 id="hero-verdict" className={styles.cardTitle}>
          {t("verdict.title")}
        </h2>
        <p className={styles.cardBody}>{t("verdict.body")}</p>
        <p className={styles.stamp}>{t("example")}</p>
      </article>

      <article className={`${styles.card} ${styles.todayCard}`} aria-labelledby="hero-today">
        <div className={styles.todayHead}>
          <h2 id="hero-today" className={styles.todayTitle}>
            {t("today.title")}
          </h2>
          <p className={styles.stamp}>{t("example")}</p>
        </div>
        <ul className={styles.roles} aria-label={t("today.label")}>
          {ROLES.map(({ key, accent, mark }) => (
            <li key={key} className={styles.role}>
              <span className={styles.tile} data-accent={accent}>
                <TileMark mark={mark} className={styles.tileMark} />
              </span>
              <span>
                <span className={styles.roleName}>{t(`today.roles.${key}.role`)}</span>
                <span className={styles.roleMeta}>
                  {t(`today.roles.${key}.company`)} · {t(`today.roles.${key}.verdict`)}
                </span>
              </span>
            </li>
          ))}
        </ul>
        <a className={styles.reasons} href="#how-it-works">
          {t("today.reasons")}
          <LongArrow className={styles.reasonsArrow} />
        </a>
      </article>
    </div>
  );
}
