import { getTranslations } from "next-intl/server";
import styles from "./about.module.css";
import s from "./sections.module.css";

const SYNCRA_URL = "https://www.syncra.studio";
const GITHUB_URL = "https://github.com/stephen-golban/pemby";

/** About: the founder story, limited to the facts the owner approved (PLAN D30). */
export async function About() {
  const t = await getTranslations("Landing.about");
  const external = { rel: "noopener noreferrer", target: "_blank" } as const;

  return (
    <section id="about" className={s.section} aria-labelledby="about-title">
      <h2 id="about-title" className={`${s.title} ${styles.title}`}>
        {t("title")}
      </h2>
      <div className={styles.body}>
        <div className={styles.story}>
          <p>{t("body1")}</p>
          <p>{t("body2")}</p>
        </div>
        <div className={styles.facts}>
          <p className={styles.signature}>{t("signature")}</p>
          <p>
            {t.rich("operator", {
              link: (chunks) => (
                <a className={s.textLink} href={SYNCRA_URL} {...external}>
                  {chunks}
                </a>
              ),
            })}
          </p>
          <p>
            {t.rich("code", {
              link: (chunks) => (
                <a className={s.textLink} href={GITHUB_URL} {...external}>
                  {chunks}
                </a>
              ),
            })}
          </p>
        </div>
      </div>
    </section>
  );
}
