import { getTranslations } from "next-intl/server";
import styles from "./landing.module.css";
import { TileMark, type Mark } from "./marks";

const FACTS = [
  { key: "tiers", accent: "yellow", mark: "reason" },
  { key: "recheck", accent: "red", mark: "clock" },
  { key: "ways", accent: "blue", mark: "briefcase" },
] as const satisfies readonly { key: string; accent: string; mark: Mark }[];

/**
 * Across the black band at the foot of the first viewport: three facts about how the product
 * works. Never statistics — no counts of people, companies or roles.
 *
 * The yellow tile carries a near-black mark, because white on #FFC629 is 1.57:1 and fails.
 */
export async function HeroFacts() {
  const t = await getTranslations("Landing.facts");
  return (
    <section className={styles.facts} aria-label={t("label")}>
      <ul className={styles.factList}>
        {FACTS.map(({ key, accent, mark }) => (
          <li key={key} className={styles.fact}>
            <span className={styles.factTile} data-accent={accent}>
              <TileMark mark={mark} className={styles.factMark} />
            </span>
            <span>
              <span className={styles.factTitle}>{t(`${key}.title`)}</span>
              <span className={styles.factBody}>{t(`${key}.body`)}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
