import { getTranslations } from "next-intl/server";
import Image from "next/image";
import doodleDark from "@/public/landing/doodle-sleeping-face-dark.png";
import doodleLight from "@/public/landing/doodle-sleeping-face.png";
import photoBackend from "@/public/landing/photo-backend.png";
import photoData from "@/public/landing/photo-data.png";
import photoPlatform from "@/public/landing/photo-platform.png";
import styles from "./match-band.module.css";

const MATCHES = [
  { key: "platform", tone: "plum", photo: photoPlatform },
  { key: "backend", tone: "ochre", photo: photoBackend },
  { key: "data", tone: "inkblue", photo: photoData },
] as const;

function Tick() {
  return (
    <svg className={styles.tick} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <rect x="0.5" y="0.5" width="15" height="15" rx="3.5" className={styles.tickBox} />
      <path
        d="m4.2 8.3 2.5 2.4 5.1-5.4"
        fill="none"
        className={styles.tickMark}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** The band: example matches standing on the deep field. Every card is labelled as an example. */
export async function MatchBand() {
  const t = await getTranslations("Landing");
  return (
    <section className={styles.band} aria-labelledby="example-matches">
      <h2 id="example-matches" className="visually-hidden">
        {t("band.label")}
      </h2>
      <div className={styles.field} aria-hidden="true" />
      <ul className={styles.cards}>
        {MATCHES.map(({ key, tone, photo }) => (
          <li key={key} className={`${styles.card} ${styles[tone]}`}>
            <article className={styles.cardInner}>
              <h3 className={styles.role}>{t(`cards.${key}.role`)}</h3>
              <p className={styles.meta}>{t(`cards.${key}.meta`)}</p>
              <ul className={styles.criteria} aria-label={t("band.criteriaLabel")}>
                <li className={styles.criterion}>
                  <Tick />
                  {t(`cards.${key}.criterion1`)}
                </li>
                <li className={styles.criterion}>
                  <Tick />
                  {t(`cards.${key}.criterion2`)}
                </li>
              </ul>
              <div className={styles.photo}>
                <Image
                  src={photo}
                  alt=""
                  fill
                  sizes="(max-width: 700px) 90vw, 360px"
                  loading="eager"
                />
              </div>
              <div className={styles.stamps}>
                <p className={styles.example}>{t("band.example")}</p>
                <p className={styles.tag}>{t(`cards.${key}.tag`)}</p>
              </div>
            </article>
          </li>
        ))}
        <li className={`${styles.card} ${styles.silence}`}>
          <article className={styles.cardInner}>
            <h3 className={styles.role}>{t("cards.silence.title")}</h3>
            <p className={styles.silenceBody}>{t("cards.silence.body")}</p>
            <Image
              src={doodleLight}
              alt=""
              className={`${styles.doodle} ${styles.doodleLight}`}
              sizes="160px"
              loading="eager"
            />
            <Image
              src={doodleDark}
              alt=""
              className={`${styles.doodle} ${styles.doodleDark}`}
              sizes="160px"
              loading="eager"
            />
            <div className={styles.stamps}>
              <p className={styles.example}>{t("band.example")}</p>
            </div>
          </article>
        </li>
      </ul>
      <p className={styles.footnote}>{t("band.footnote")}</p>
    </section>
  );
}
