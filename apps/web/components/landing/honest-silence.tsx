import { getTranslations } from "next-intl/server";
import type { CSSProperties } from "react";
import styles from "./honest-silence.module.css";
import { TileMark, type Mark } from "./marks";
import s from "./sections.module.css";
import { SilenceStage } from "./silence-stage";

/*
 * The six near misses and the loose pile each one starts from in the signature motion: an offset
 * (px) and a tilt (deg) away from its settled place in its group. Hand-set so the pile reads as
 * a heap gathered under the summary line, not as a uniform stagger.
 *
 * The tile accent is the gate that blocked the post, not decoration: red for eligibility, blue for
 * a level, yellow for what the post did not say.
 */
const GROUPS = [
  {
    key: "salary",
    accent: "yellow",
    mark: "wallet",
    jobs: [
      { key: "j1", from: [150, -70, -7] },
      { key: "j2", from: [-20, -60, 5] },
      { key: "j3", from: [260, -110, -3] },
    ],
  },
  {
    key: "seniority",
    accent: "blue",
    mark: "level",
    jobs: [
      { key: "j4", from: [-10, -215, 8] },
      { key: "j5", from: [40, -230, -9] },
    ],
  },
  {
    key: "relocation",
    accent: "red",
    mark: "plane",
    jobs: [{ key: "j6", from: [120, -330, 6] }],
  },
] as const satisfies readonly {
  key: string;
  accent: string;
  mark: Mark;
  jobs: readonly { key: string; from: readonly [number, number, number] }[];
}[];

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
        <article className={`${s.card} ${styles.card}`} aria-labelledby="silence-card-title">
          <div className={styles.head}>
            <span className={s.tile} data-accent="ink">
              <TileMark mark="question" className={s.tileMark} />
            </span>
            <div className={styles.headText}>
              <h3 id="silence-card-title" className={styles.cardTitle}>
                {t("cardTitle")}
              </h3>
              <p className={styles.summary}>{t("cardSummary")}</p>
            </div>
            <p className={s.stamp}>{t("example")}</p>
          </div>

          <ul className={styles.groups}>
            {GROUPS.map((group) => (
              <li key={group.key} className={styles.group}>
                <div className={styles.groupHead}>
                  <span className={`${s.tile} ${styles.groupTile}`} data-accent={group.accent}>
                    <TileMark mark={group.mark} className={styles.groupMark} />
                  </span>
                  <span className={styles.count}>{t(`groups.${group.key}.count`)}</span>
                  <span className={styles.groupLabel}>{t(`groups.${group.key}.label`)}</span>
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
                <span className={styles.fix}>{t(`groups.${group.key}.fix`)}</span>
              </li>
            ))}
          </ul>
        </article>
      </SilenceStage>

      <p className={styles.note}>{t("fixNote")}</p>
    </section>
  );
}
