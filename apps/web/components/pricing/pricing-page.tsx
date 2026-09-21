import { getTranslations } from "next-intl/server";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { ArrowMark, CellMark, PlusMark, PromiseMark, SpanMark } from "./marks";
import type { PromiseMarkKind } from "./marks";
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
  { key: "yellow", free: "text", pass: "text" },
  { key: "guarantee", free: "no", pass: "yes" },
] as const satisfies readonly { key: string; free: Cell; pass: Cell }[];

/**
 * The three passes, in the order they are bought in. The accent is a solid fill on the tile and
 * nowhere else; yellow carries a near-black mark, because white on #FFC629 is 1.57:1 and fails.
 */
const PASSES = [
  { key: "oneMonth", accent: "blue", months: 1 },
  { key: "threeMonths", accent: "yellow", months: 3, recommended: true },
  { key: "sixMonths", accent: "green", months: 6 },
] as const satisfies readonly {
  key: string;
  accent: "blue" | "yellow" | "green";
  months: 1 | 3 | 6;
  recommended?: true;
}[];

/**
 * The three trust mechanics, which are part of the offer and are shown with it rather than in the
 * small print: the guarantee that adds time, the pause that keeps it, and the refund window.
 */
const PROMISES = [
  { key: "guarantee", accent: "green", mark: "guarantee" },
  { key: "landed", accent: "blue", mark: "pause" },
  { key: "refunds", accent: "yellow", mark: "refund" },
] as const satisfies readonly {
  key: string;
  accent: "blue" | "yellow" | "green";
  mark: PromiseMarkKind;
}[];

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
    return (
      <span className={styles.mark} data-value={kind}>
        <CellMark value={kind} />
        <span className="visually-hidden">{t(`compare.${kind}`)}</span>
      </span>
    );
  };

  return (
    <div className={styles.page}>
      <SiteHeader cta />
      <main id="main">
        {/* The offer, at poster scale ------------------------------------ */}
        <section className={styles.hero} aria-labelledby="pricing-title">
          <h1 id="pricing-title" className={styles.headline}>
            {t("hero.title")}
          </h1>
          <p className={styles.lede}>{t("hero.lede")}</p>
          <div className={styles.heroActions}>
            <Link href="/" className={styles.action}>
              {t("cta.startFree")}
              <ArrowMark className={styles.actionArrow} />
            </Link>
            <a href="#passes-title" className={styles.outlinePill}>
              {t("hero.seePasses")}
              <ArrowMark className={styles.actionArrow} />
            </a>
          </div>
          <p className={styles.heroNote}>{t("hero.noteOneTime")}</p>
        </section>

        {/* The three passes, on the near-black band ---------------------- */}
        <section className={styles.band} aria-labelledby="passes-title">
          <div className={styles.bandInner}>
            <div className={styles.bandHead}>
              <h2 id="passes-title" className={styles.bandTitle}>
                {t("passes.title")}
              </h2>
              <p className={styles.bandLede}>{t("passes.lede")}</p>
            </div>

            <ul className={styles.cards}>
              {PASSES.map((pass, index) => {
                const recommended = "recommended" in pass && pass.recommended === true;
                return (
                  <li
                    key={pass.key}
                    className={styles.card}
                    data-recommended={recommended || undefined}
                    style={{ "--settle-index": index } as CSSProperties}
                  >
                    <div className={styles.cardTop}>
                      <span className={styles.cardTile} data-accent={pass.accent}>
                        <SpanMark months={pass.months} className={styles.cardTileMark} />
                      </span>
                      {recommended ? (
                        <span className={styles.badge}>{t("passes.threeMonths.badge")}</span>
                      ) : null}
                    </div>

                    <h3 className={styles.cardName}>{t(`passes.${pass.key}.name`)}</h3>
                    <p className={styles.price}>{t(`passes.${pass.key}.price`)}</p>
                    <p className={styles.duration}>{t(`passes.${pass.key}.duration`)}</p>
                    <p className={styles.perMonth}>{t(`passes.${pass.key}.perMonth`)}</p>

                    {/* `aria-disabled`, not `disabled`: checkout is not built yet, and a button
                        taken out of the tab order leaves a keyboard reader with no way to reach
                        the line that explains why nothing happens. */}
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

            <div className={styles.bandNotes}>
              <p id={CHECKOUT_NOTE_ID} className={styles.checkoutNote}>
                {t("cta.notOpenDetail")}
              </p>
              <p>{t("passes.includes")}</p>
              <p className={styles.bandFine}>
                {t("passes.oneTime")} {t("passes.currencyNote")}
              </p>
            </div>
          </div>
        </section>

        {/* Free against a pass ------------------------------------------ */}
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
                    <span className={styles.passLabel}>{t("compare.colPass")}</span>
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

        {/* What a pass promises ----------------------------------------- */}
        <section className={styles.section} aria-labelledby="promises-title">
          <h2 id="promises-title" className={styles.sectionTitle}>
            {t("promises.title")}
          </h2>
          <ul className={styles.promises}>
            {PROMISES.map((promise, index) => (
              <li
                key={promise.key}
                className={styles.promise}
                style={{ "--settle-index": index } as CSSProperties}
              >
                <span className={styles.promiseTile} data-accent={promise.accent}>
                  <PromiseMark kind={promise.mark} className={styles.promiseTileMark} />
                </span>
                <h3 className={styles.promiseTitle}>{t(`${promise.key}.title`)}</h3>
                <p className={styles.promiseBody}>
                  {promise.key === "refunds" ? t.rich("refunds.body", { email }) : null}
                  {promise.key === "guarantee" ? t("guarantee.body") : null}
                  {promise.key === "landed" ? t("landed.body") : null}
                </p>
                {promise.key === "guarantee" ? (
                  <p className={styles.promiseFine}>{t("guarantee.scope")}</p>
                ) : null}
                {promise.key === "refunds" ? (
                  <Link className={styles.textLink} href="/refunds">
                    {t("refunds.link")}
                    <ArrowMark className={styles.actionArrow} />
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        </section>

        {/* How a pass runs out, and how it does not ---------------------- */}
        <section className={styles.section} aria-labelledby="how-title">
          <h2 id="how-title" className={styles.sectionTitle}>
            {t("how.title")}
          </h2>
          {/* A picture of the three sentences below it, and nothing the words do not already say,
              so it is hidden from the accessibility tree rather than read out twice. */}
          <div className={styles.timeline} aria-hidden="true">
            <div className={styles.track}>
              <span className={styles.segCurrent}>{t("how.diagram.current")}</span>
              <span className={styles.segNext}>
                {t("how.diagram.next")}
                <span className={styles.reminderTick}>
                  <span className={styles.reminder}>{t("how.diagram.reminder")}</span>
                </span>
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

        {/* Questions ----------------------------------------------------- */}
        <section className={`${styles.section} ${styles.faq}`} aria-labelledby="faq-title">
          <h2 id="faq-title" className={styles.sectionTitle}>
            {t("faq.title")}
          </h2>
          <div className={styles.faqList}>
            {FAQ.map((item) => (
              <details key={item} className={styles.faqItem}>
                <summary className={styles.faqQuestion}>
                  <span>{t(`faq.${item}.q`)}</span>
                  <PlusMark className={styles.faqIcon} barClassName={styles.faqIconVertical} />
                </summary>
                <div className={styles.faqAnswer}>
                  <p>
                    {item === "refund" ? t.rich("faq.refund.a", { email }) : t(`faq.${item}.a`)}
                  </p>
                  {item === "privacy" ? (
                    <Link className={styles.textLink} href="/privacy">
                      {t("faq.privacy.link")}
                      <ArrowMark className={styles.actionArrow} />
                    </Link>
                  ) : null}
                  {item === "refund" ? (
                    <Link className={styles.textLink} href="/refunds">
                      {t("faq.refund.link")}
                      <ArrowMark className={styles.actionArrow} />
                    </Link>
                  ) : null}
                </div>
              </details>
            ))}
          </div>
        </section>

        {/* Software, not an agency --------------------------------------- */}
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
