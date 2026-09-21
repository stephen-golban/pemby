import { getTranslations } from "next-intl/server";
import Link from "next/link";
import styles from "./passes.module.css";
import { LongArrow, TileMark } from "./marks";
import s from "./sections.module.css";

const FREE_ITEMS = ["one", "two", "three"] as const;
const PASS_ITEMS = ["one", "two", "three"] as const;
const PRICES = [
  { key: "one", highlighted: false },
  { key: "three", highlighted: true },
  { key: "six", highlighted: false },
] as const;

/** Free against Pass in one glance, with the real prices. The full comparison lives on /pricing. */
export async function Passes() {
  const t = await getTranslations("Landing.passes");

  return (
    <section className={s.section} aria-labelledby="passes-title">
      <h2 id="passes-title" className={s.title}>
        {t("title")}
      </h2>
      <p className={s.intro}>{t("terms")}</p>

      <div className={styles.plans}>
        <div className={`${s.card} ${styles.plan}`}>
          <span className={s.tile} data-accent="ink">
            <TileMark mark="check" className={s.tileMark} />
          </span>
          <h3 className={styles.planName}>
            {t("free.name")}
            <span className={styles.freePrice}>{t("free.price")}</span>
          </h3>
          <ul className={styles.items}>
            {FREE_ITEMS.map((item) => (
              <li key={item}>{t(`free.items.${item}`)}</li>
            ))}
          </ul>
        </div>

        <div className={`${s.card} ${styles.plan}`}>
          <span className={s.tile} data-accent="yellow">
            <TileMark mark="sparkle" className={s.tileMark} />
          </span>
          <h3 className={styles.planName}>{t("pass.name")}</h3>
          <ul className={styles.items}>
            {PASS_ITEMS.map((item) => (
              <li key={item}>{t(`pass.items.${item}`)}</li>
            ))}
          </ul>
          <ul className={styles.prices} aria-label={t("prices.label")}>
            {PRICES.map(({ key, highlighted }) => (
              <li key={key} className={styles.price} data-highlighted={highlighted || undefined}>
                <span className={styles.amount}>{t(`prices.${key}.amount`)}</span>
                <span className={styles.term}>{t(`prices.${key}.term`)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <Link href="/pricing" className={`${s.action} ${styles.link}`}>
        {t("link")}
        <LongArrow className={s.actionArrow} />
      </Link>
    </section>
  );
}
