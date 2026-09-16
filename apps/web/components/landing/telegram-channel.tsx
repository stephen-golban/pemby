import { getTranslations } from "next-intl/server";
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
            <svg viewBox="0 0 18 18" aria-hidden="true" focusable="false">
              <path
                d="M5 13 13 5M6.5 5H13v6.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </a>
        </div>

        <figure className={styles.post}>
          <div className={styles.postHead}>
            <span className={styles.channel}>{t("channel")}</span>
            <span>{t("time")}</span>
          </div>
          <p className={styles.role}>{t("role")}</p>
          <p className={styles.company}>{t("company")}</p>
          <ul className={styles.facts}>
            <li className={styles.green}>
              <span className={styles.swatch} aria-hidden="true" />
              {t("hires")}
            </li>
            <li>{t("ways")}</li>
          </ul>
          <p className={styles.late}>{t("late")}</p>
          <figcaption className={styles.stamp}>
            <span className={s.example}>{t("example")}</span>
          </figcaption>
        </figure>
      </div>
    </section>
  );
}
