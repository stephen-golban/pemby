import { getTranslations } from "next-intl/server";
import Link from "next/link";
import type { ReactNode } from "react";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import styles from "./pricing.module.css";

const EMAIL = "hello@pemby.app";
const CHECKOUT_NOTE_ID = "checkout-note";

type Cell = "yes" | "no" | "text";
const COMPARE_ROWS = [
  { key: "cvParse", free: "yes", pass: "yes" },
  { key: "onboarding", free: "yes", pass: "yes" },
  { key: "brief", free: "yes", pass: "yes" },
  { key: "delivery", free: "text", pass: "text" },
  { key: "kits", free: "text", pass: "text" },
  { key: "green", free: "yes", pass: "yes" },
  { key: "yellow", free: "no", pass: "text" },
  { key: "guarantee", free: "no", pass: "yes" },
] as const satisfies readonly { key: string; free: Cell; pass: Cell }[];

const PASSES = [
  { key: "oneMonth", tone: "plum" },
  { key: "threeMonths", tone: "ochre", recommended: true },
  { key: "sixMonths", tone: "inkblue" },
] as const;

const HOW = ["oneTime", "stack", "reminder"] as const;
const FAQ = [
  "subscription",
  "ends",
  "stack",
  "nothing",
  "outcome",
  "kit",
  "tiers",
  "source",
  "privacy",
  "refund",
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

function Mark({ value, label }: { value: "yes" | "no"; label: string }) {
  return (
    <span className={styles.mark} data-value={value}>
      <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
        {value === "yes" ? (
          <path
            d="m4.5 10.5 3.5 3.5 7.5-8"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : (
          <path
            d="M6 10h8"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        )}
      </svg>
      <span className="visually-hidden">{label}</span>
    </span>
  );
}

function PlusIcon() {
  return (
    <svg className={styles.faqIcon} viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path
        className={styles.faqIconVertical}
        d="M10 4v12"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path d="M4 10h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export async function PricingPage() {
  const t = await getTranslations("Pricing");
  const email = (chunks: ReactNode) => (
    <a className={styles.inlineLink} href={`mailto:${EMAIL}`}>
      {chunks}
    </a>
  );

  const cell = (row: (typeof COMPARE_ROWS)[number], column: "free" | "pass") => {
    const kind = row[column];
    if (kind === "text") {
      // Only rows with a text cell carry that column's key in the messages.
      return t(`compare.rows.${row.key}.${column}` as Parameters<typeof t>[0]);
    }
    return <Mark value={kind} label={t(`compare.${kind}`)} />;
  };

  return (
    <div className={styles.page}>
      <SiteHeader />
      <main id="main">
        {/* Hero */}
        <section className={styles.hero} aria-labelledby="pricing-title">
          <h1 id="pricing-title" className={styles.headline}>
            {t("hero.title")}
          </h1>
          <p className={styles.lede}>{t("hero.lede")}</p>
          <div className={styles.heroActions}>
            <Link href="/" className={styles.action}>
              {t("cta.startFree")}
              <Arrow />
            </Link>
            <p className={styles.heroNote}>{t("hero.noteOneTime")}</p>
          </div>
        </section>

        {/* Free vs Pass */}
        <section className={styles.section} aria-labelledby="compare-title">
          <h2 id="compare-title" className={styles.sectionTitle}>
            {t("compare.title")}
          </h2>
          <div className={styles.compare}>
            <table className={styles.compareTable}>
              <thead>
                <tr>
                  <th scope="col" className={styles.colFeature}>
                    {t("compare.colFeature")}
                  </th>
                  <th scope="col" className={styles.colFree}>
                    {t("compare.colFree")}
                  </th>
                  <th scope="col" className={styles.colPass}>
                    {t("compare.colPass")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {COMPARE_ROWS.map((row) => (
                  <tr key={row.key}>
                    <th scope="row" className={styles.feature}>
                      {t(`compare.rows.${row.key}.feature`)}
                    </th>
                    <td className={styles.free} data-label={t("compare.colFree")}>
                      {cell(row, "free")}
                    </td>
                    <td className={styles.pass} data-label={t("compare.colPass")}>
                      {cell(row, "pass")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className={styles.compareNotes}>
            <li>{t("compare.freeNote")}</li>
            <li>{t("compare.quietNote")}</li>
            <li>{t("compare.ownKeyNote")}</li>
          </ul>
        </section>

        {/* The three passes */}
        <section className={styles.field} aria-labelledby="passes-title">
          <div className={styles.fieldInner}>
            <div className={styles.fieldHead}>
              <h2 id="passes-title" className={styles.sectionTitle}>
                {t("passes.title")}
              </h2>
              <p className={styles.fieldLede}>{t("passes.lede")}</p>
            </div>
            <ul className={styles.cards}>
              {PASSES.map((pass) => {
                const recommended = "recommended" in pass && pass.recommended;
                return (
                  <li
                    key={pass.key}
                    className={styles.card}
                    data-tone={pass.tone}
                    data-recommended={recommended || undefined}
                  >
                    <div className={styles.cardTop}>
                      <h3 className={styles.cardName}>{t(`passes.${pass.key}.name`)}</h3>
                      {recommended ? (
                        <span className={styles.badge}>{t("passes.threeMonths.badge")}</span>
                      ) : null}
                    </div>
                    <p className={styles.price}>{t(`passes.${pass.key}.price`)}</p>
                    <p className={styles.duration}>{t(`passes.${pass.key}.duration`)}</p>
                    <p className={styles.perMonth}>{t(`passes.${pass.key}.perMonth`)}</p>
                    <button
                      type="button"
                      className={styles.buy}
                      aria-disabled="true"
                      aria-describedby={CHECKOUT_NOTE_ID}
                    >
                      {t("cta.notOpen")}
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className={styles.fieldNotes}>
              <p id={CHECKOUT_NOTE_ID} className={styles.checkoutNote}>
                {t("cta.notOpenDetail")}
              </p>
              <p>{t("passes.includes")}</p>
              <p>
                {t("passes.oneTime")} {t("passes.currencyNote")}
              </p>
            </div>
          </div>
        </section>

        {/* How passes work */}
        <section className={styles.section} aria-labelledby="how-title">
          <h2 id="how-title" className={styles.sectionTitle}>
            {t("how.title")}
          </h2>
          <div className={styles.timeline} aria-hidden="true">
            <p className={styles.reminder}>{t("how.diagram.reminder")}</p>
            <div className={styles.track}>
              <span className={styles.segCurrent}>{t("how.diagram.current")}</span>
              <span className={styles.segNext}>
                {t("how.diagram.next")}
                <span className={styles.reminderTick} />
              </span>
              <span className={styles.segFree}>{t("how.diagram.free")}</span>
            </div>
          </div>
          <ul className={styles.how}>
            {HOW.map((item) => (
              <li key={item} className={styles.howItem}>
                <h3 className={styles.howTitle}>{t(`how.${item}.title`)}</h3>
                <p className={styles.howBody}>{t(`how.${item}.body`)}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* Refunds, guarantee, pause */}
        <div className={styles.section}>
          <section className={styles.promise} aria-labelledby="refunds-title">
            <h2 id="refunds-title" className={styles.promiseTitle}>
              {t("refunds.title")}
            </h2>
            <div className={styles.promiseBody}>
              <p>{t.rich("refunds.body", { email })}</p>
              <Link className={styles.textLink} href="/refunds">
                {t("refunds.link")}
                <Arrow />
              </Link>
            </div>
          </section>
          <section className={styles.promise} aria-labelledby="guarantee-title">
            <h2 id="guarantee-title" className={styles.promiseTitle}>
              {t("guarantee.title")}
            </h2>
            <div className={styles.promiseBody}>
              <p>{t("guarantee.body")}</p>
              <p className={styles.fine}>{t("guarantee.scope")}</p>
            </div>
          </section>
          <section className={styles.promise} aria-labelledby="landed-title">
            <h2 id="landed-title" className={styles.promiseTitle}>
              {t("landed.title")}
            </h2>
            <div className={styles.promiseBody}>
              <p>{t("landed.body")}</p>
            </div>
          </section>
        </div>

        {/* FAQ */}
        <section className={`${styles.section} ${styles.faq}`} aria-labelledby="faq-title">
          <h2 id="faq-title" className={styles.sectionTitle}>
            {t("faq.title")}
          </h2>
          <div className={styles.faqList}>
            {FAQ.map((item) => (
              <details key={item} className={styles.faqItem}>
                <summary className={styles.faqQuestion}>
                  <span>{t(`faq.${item}.q`)}</span>
                  <PlusIcon />
                </summary>
                <div className={styles.faqAnswer}>
                  <p>
                    {item === "refund" ? t.rich("faq.refund.a", { email }) : t(`faq.${item}.a`)}
                  </p>
                  {item === "privacy" ? (
                    <Link className={styles.textLink} href="/privacy">
                      {t("faq.privacy.link")}
                      <Arrow />
                    </Link>
                  ) : null}
                  {item === "refund" ? (
                    <Link className={styles.textLink} href="/refunds">
                      {t("faq.refund.link")}
                      <Arrow />
                    </Link>
                  ) : null}
                </div>
              </details>
            ))}
          </div>
        </section>

        {/* Software, not an agency */}
        <section className={styles.section} aria-labelledby="what-title">
          <div className={styles.whatItIs}>
            <h2 id="what-title" className={styles.whatTitle}>
              {t("whatItIs.title")}
            </h2>
            <p className={styles.whatBody}>{t("whatItIs.body")}</p>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
