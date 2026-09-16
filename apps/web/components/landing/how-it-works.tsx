import { getTranslations } from "next-intl/server";
import s from "./sections.module.css";
import styles from "./how-it-works.module.css";

function Tick({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <rect x="0.5" y="0.5" width="15" height="15" rx="3.5" fill="currentColor" />
      <path
        d="m4.2 8.3 2.5 2.4 5.1-5.4"
        fill="none"
        stroke="var(--tick-mark, var(--color-ground))"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * How it works: the mechanism as the artefacts a person meets at each step (a read CV, the
 * pre-filled cards, a match message, the kit), not as icon columns. Every artefact is an example.
 */
export async function HowItWorks() {
  const t = await getTranslations("Landing.how");
  const example = <span className={`${s.example} ${styles.stamp}`}>{t("example")}</span>;

  return (
    <section id="how-it-works" className={s.section} aria-labelledby="how-title">
      <div className={styles.layout}>
        <div className={styles.lead}>
          <h2 id="how-title" className={s.title}>
            {t("title")}
          </h2>
          <p className={s.intro}>{t("intro")}</p>
        </div>

        <ol className={styles.steps}>
          <li className={styles.step}>
            <div className={styles.copy}>
              <h3 className={styles.stepTitle}>{t("steps.drop.title")}</h3>
              <p className={styles.stepBody}>{t("steps.drop.body")}</p>
            </div>
            <div className={styles.artefact} aria-hidden="true">
              <div className={styles.file}>
                <svg className={styles.fileGlyph} viewBox="0 0 24 30" focusable="false">
                  <path
                    d="M3 1.5h12l6 6V27a1.5 1.5 0 0 1-1.5 1.5h-16.5A1.5 1.5 0 0 1 1.5 27V3A1.5 1.5 0 0 1 3 1.5Z M15 1.5V7.5h6"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinejoin="round"
                  />
                </svg>
                <span className={styles.fileName}>{t("steps.drop.file")}</span>
                <span className={styles.fileState}>
                  <Tick className={styles.tick} />
                  {t("steps.drop.fileState")}
                </span>
              </div>
              {example}
            </div>
          </li>

          <li className={styles.step}>
            <div className={styles.copy}>
              <h3 className={styles.stepTitle}>{t("steps.confirm.title")}</h3>
              <p className={styles.stepBody}>{t("steps.confirm.body")}</p>
            </div>
            <div className={styles.artefact} aria-hidden="true">
              <div className={styles.stack}>
                {(["card1", "card2", "card3"] as const).map((card) => (
                  <div key={card} className={styles.prefill}>
                    <span className={styles.prefillLabel}>{t(`steps.confirm.${card}`)}</span>
                    <span className={styles.prefillValue}>
                      <Tick className={styles.tick} />
                      {t(`steps.confirm.${card}Value`)}
                    </span>
                  </div>
                ))}
              </div>
              {example}
            </div>
          </li>

          <li className={styles.step}>
            <div className={styles.copy}>
              <h3 className={styles.stepTitle}>{t("steps.deliver.title")}</h3>
              <p className={styles.stepBody}>{t("steps.deliver.body")}</p>
            </div>
            <div className={styles.artefact} aria-hidden="true">
              <div className={styles.message}>
                <div className={styles.messageHead}>
                  <span>{t("steps.deliver.channel")}</span>
                  <span>{t("steps.deliver.time")}</span>
                </div>
                <p className={styles.messageLabel}>{t("steps.deliver.label")}</p>
                <p className={styles.messageRole}>{t("steps.deliver.role")}</p>
                <p className={styles.messageCompany}>{t("steps.deliver.company")}</p>
                <p className={styles.messageWhy}>{t("steps.deliver.why")}</p>
                <ul className={styles.reasons}>
                  {(["reason1", "reason2", "reason3"] as const).map((reason) => (
                    <li key={reason}>
                      <Tick className={styles.tick} />
                      {t(`steps.deliver.${reason}`)}
                    </li>
                  ))}
                </ul>
                <p className={styles.gap}>{t("steps.deliver.gap")}</p>
              </div>
              {example}
            </div>
          </li>

          <li className={styles.step}>
            <div className={styles.copy}>
              <h3 className={styles.stepTitle}>{t("steps.apply.title")}</h3>
              <p className={styles.stepBody}>{t("steps.apply.body")}</p>
            </div>
            <div className={styles.artefact} aria-hidden="true">
              <ul className={styles.kit}>
                {(["kit1", "kit2", "kit3"] as const).map((item) => (
                  <li key={item} className={styles.kitRow}>
                    <span>{t(`steps.apply.${item}`)}</span>
                    <span className={styles.copyChip}>{t("steps.apply.copy")}</span>
                  </li>
                ))}
              </ul>
              {example}
            </div>
          </li>
        </ol>
      </div>
    </section>
  );
}
