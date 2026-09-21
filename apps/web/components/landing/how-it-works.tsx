import { getTranslations } from "next-intl/server";
import styles from "./how-it-works.module.css";
import { TileMark } from "./marks";
import s from "./sections.module.css";

function Check({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <rect x="0.5" y="0.5" width="15" height="15" rx="4" fill="currentColor" />
      <path
        d="m4.2 8.3 2.5 2.4 5.1-5.4"
        fill="none"
        stroke="var(--color-ground)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * How it works: the mechanism as the artefacts a person meets at each step — a read CV, the
 * pre-filled cards, a match message, the kit — not as icon columns. Each step is a white card with
 * its own solid accent tile, and every artefact carries the EXAMPLE stamp.
 */
export async function HowItWorks() {
  const t = await getTranslations("Landing.how");
  const stamp = <span className={`${s.stamp} ${styles.stamp}`}>{t("example")}</span>;

  return (
    <section id="how-it-works" className={s.section} aria-labelledby="how-title">
      <h2 id="how-title" className={s.title}>
        {t("title")}
      </h2>
      <p className={s.intro}>{t("intro")}</p>

      <ol className={styles.steps}>
        <li className={`${s.card} ${styles.step}`}>
          <span className={s.tile} data-accent="blue">
            <TileMark mark="file" className={s.tileMark} />
          </span>
          <h3 className={styles.stepTitle}>{t("steps.drop.title")}</h3>
          <p className={styles.stepBody}>{t("steps.drop.body")}</p>
          <div className={styles.artefact}>
            <div className={styles.file} aria-hidden="true">
              <span className={styles.fileName}>{t("steps.drop.file")}</span>
              <span className={styles.fileState}>
                <Check className={styles.tick} />
                {t("steps.drop.fileState")}
              </span>
            </div>
            {stamp}
          </div>
        </li>

        <li className={`${s.card} ${styles.step}`}>
          <span className={s.tile} data-accent="yellow">
            <TileMark mark="check" className={s.tileMark} />
          </span>
          <h3 className={styles.stepTitle}>{t("steps.confirm.title")}</h3>
          <p className={styles.stepBody}>{t("steps.confirm.body")}</p>
          <div className={styles.artefact}>
            <div className={styles.stack} aria-hidden="true">
              {(["card1", "card2", "card3"] as const).map((card) => (
                <div key={card} className={styles.prefill}>
                  <span className={styles.prefillLabel}>{t(`steps.confirm.${card}`)}</span>
                  <span className={styles.prefillValue}>
                    <Check className={styles.tick} />
                    {t(`steps.confirm.${card}Value`)}
                  </span>
                </div>
              ))}
            </div>
            {stamp}
          </div>
        </li>

        <li className={`${s.card} ${styles.step}`}>
          <span className={s.tile} data-accent="green">
            <TileMark mark="send" className={s.tileMark} />
          </span>
          <h3 className={styles.stepTitle}>{t("steps.deliver.title")}</h3>
          <p className={styles.stepBody}>{t("steps.deliver.body")}</p>
          <div className={styles.artefact}>
            <div className={styles.message} aria-hidden="true">
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
                    <Check className={styles.tick} />
                    {t(`steps.deliver.${reason}`)}
                  </li>
                ))}
              </ul>
              <p className={styles.gap}>{t("steps.deliver.gap")}</p>
            </div>
            {stamp}
          </div>
        </li>

        <li className={`${s.card} ${styles.step}`}>
          <span className={s.tile} data-accent="ink">
            <TileMark mark="sparkle" className={s.tileMark} />
          </span>
          <h3 className={styles.stepTitle}>{t("steps.apply.title")}</h3>
          <p className={styles.stepBody}>{t("steps.apply.body")}</p>
          <div className={styles.artefact}>
            <ul className={styles.kit} aria-hidden="true">
              {(["kit1", "kit2", "kit3"] as const).map((item) => (
                <li key={item} className={styles.kitRow}>
                  <span>{t(`steps.apply.${item}`)}</span>
                  <span className={styles.copyChip}>{t("steps.apply.copy")}</span>
                </li>
              ))}
            </ul>
            {stamp}
          </div>
        </li>
      </ol>
    </section>
  );
}
