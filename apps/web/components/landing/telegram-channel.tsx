import { getTranslations } from "next-intl/server";
import { LongArrow, TileMark } from "./marks";
import s from "./sections.module.css";
import styles from "./telegram-channel.module.css";

const TELEGRAM_URL = "https://t.me/pemby_jobs";

/** The public Telegram channel: green jobs, 24 hours late, no account. */
export async function TelegramChannel() {
  const t = await getTranslations("Landing.telegram");

  return (
    <section className={s.section} aria-labelledby="telegram-title">
      <div className={styles.panel}>
        <div className={styles.copy}>
          <h2 id="telegram-title" className={styles.title}>
            {t("title")}
          </h2>
          <p className={styles.body}>{t("body")}</p>
          <a
            className={styles.action}
            href={TELEGRAM_URL}
            rel="noopener noreferrer"
            target="_blank"
          >
            {t("link")}
            <LongArrow className={styles.actionArrow} />
          </a>
        </div>

        <figure className={styles.post}>
          <div className={styles.postHead}>
            <span className={styles.channel}>{t("channel")}</span>
            <span className={styles.time}>{t("time")}</span>
          </div>
          <div className={styles.postBody}>
            <span className={s.tile} data-accent="green">
              <TileMark mark="check" className={s.tileMark} />
            </span>
            <div>
              <p className={styles.role}>{t("role")}</p>
              <p className={styles.company}>{t("company")}</p>
            </div>
          </div>
          <p className={s.tierPill} data-tier="green">
            {t("hires")}
          </p>
          <p className={styles.ways}>{t("ways")}</p>
          <p className={styles.late}>{t("late")}</p>
          <figcaption>
            <span className={s.stamp}>{t("example")}</span>
          </figcaption>
        </figure>
      </div>
    </section>
  );
}
