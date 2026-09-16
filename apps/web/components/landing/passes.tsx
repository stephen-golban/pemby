import { getTranslations } from "next-intl/server";
import Link from "next/link";
import styles from "./passes.module.css";
import s from "./sections.module.css";

const ITEMS = ["one", "two", "three", "four"] as const;
const PRICES = [
  { key: "one", highlighted: false },
  { key: "three", highlighted: true },
  { key: "six", highlighted: false },
] as const;

function Arrow() {
  return (
    <svg viewBox="0 0 18 18" aria-hidden="true" focusable="false">
      <path
        d="M3 9h11.5M10 4.5 14.5 9 10 13.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Free against Pass in one glance, with the real prices. The full comparison lives on /pricing. */
export async function Passes() {
  const t = await getTranslations("Landing.passes");

  return (
    <section className={s.section} aria-labelledby="passes-title">
      <div className={styles.layout}>
        <div className={styles.lead}>
          <h2 id="passes-title" className={s.title}>
            {t("title")}
          </h2>
          <p className={s.intro}>{t("terms")}</p>
          <Link href="/pricing" className={`${s.action} ${styles.link}`}>
            {t("link")}
            <Arrow />
          </Link>
        </div>

        <div className={styles.plans}>
          <div className={styles.free}>
            <h3 className={styles.planName}>
              {t("free.name")}
              <span className={styles.freePrice}>{t("free.price")}</span>
            </h3>
            <ul className={styles.items}>
              {ITEMS.map((item) => (
                <li key={item}>{t(`free.items.${item}`)}</li>
              ))}
            </ul>
          </div>

          <div className={styles.pass}>
            <h3 className={styles.planName}>{t("pass.name")}</h3>
            <ul className={styles.items}>
              {ITEMS.map((item) => (
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
      </div>
    </section>
  );
}
