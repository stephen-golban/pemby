import { getTranslations } from "next-intl/server";
import Image from "next/image";
import type { CSSProperties } from "react";
import doodleDark from "@/public/landing/doodle-sleeping-face-dark.png";
import doodleLight from "@/public/landing/doodle-sleeping-face.png";
import styles from "./honest-silence.module.css";
import s from "./sections.module.css";
import { SilenceStage } from "./silence-stage";

/*
 * The six near misses and the loose pile each one starts from in the signature motion: an offset
 * (px) and a tilt (deg) away from its settled place in its group. Hand-set so the pile reads as
 * a heap gathered under the summary line, not as a uniform stagger.
 */
const GROUPS = [
  {
    key: "salary",
    jobs: [
      { key: "j1", from: [150, -70, -7] },
      { key: "j2", from: [-20, -60, 5] },
      { key: "j3", from: [260, -110, -3] },
    ],
  },
  {
    key: "seniority",
    jobs: [
      { key: "j4", from: [-10, -215, 8] },
      { key: "j5", from: [40, -230, -9] },
    ],
  },
  { key: "relocation", jobs: [{ key: "j6", from: [120, -330, 6] }] },
] as const;

/** Honest silence, the page's memorable moment: what a Brief says when nothing passes. */
export async function HonestSilence() {
  const t = await getTranslations("Landing.silence");
  let order = 0;

  return (
    <section className={`${s.section} ${styles.section}`} aria-labelledby="silence-title">
      <h2 id="silence-title" className={`${s.title} ${styles.title}`}>
        {t("title")}
      </h2>
      <p className={`${s.intro} ${styles.intro}`}>{t("body")}</p>

      <SilenceStage className={styles.stage}>
        <article className={styles.card} aria-labelledby="silence-card-title">
          <div className={styles.head}>
            <div>
              <h3 id="silence-card-title" className={styles.cardTitle}>
                {t("cardTitle")}
              </h3>
              <p className={styles.summary}>{t("cardSummary")}</p>
            </div>
            <div className={styles.doodle} aria-hidden="true">
              <Image src={doodleLight} alt="" className={styles.doodleLight} sizes="120px" />
              <Image src={doodleDark} alt="" className={styles.doodleDark} sizes="120px" />
            </div>
          </div>

          <ul className={styles.groups}>
            {GROUPS.map((group) => (
              <li key={group.key} className={styles.group}>
                <div className={styles.groupHead}>
                  <span className={styles.count}>{t(`groups.${group.key}.count`)}</span>
                  <span className={styles.groupLabel}>{t(`groups.${group.key}.label`)}</span>
                  <span className={styles.fix}>{t(`groups.${group.key}.fix`)}</span>
                </div>
                <ul className={styles.jobs}>
                  {group.jobs.map((job) => {
                    const [x, y, r] = job.from;
                    const style = {
                      "--i": order++,
                      "--from-x": `${x}px`,
                      "--from-y": `${y}px`,
                      "--from-r": `${r}deg`,
                    } as CSSProperties;
                    return (
                      <li key={job.key} className={styles.job} style={style}>
                        {t(`jobs.${job.key}`)}
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ul>

          <p className={`${s.example} ${styles.stamp}`}>{t("example")}</p>
        </article>
      </SilenceStage>

      <p className={styles.note}>{t("fixNote")}</p>
    </section>
  );
}
