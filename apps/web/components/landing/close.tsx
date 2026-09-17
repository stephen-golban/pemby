import { getTranslations } from "next-intl/server";
import styles from "./close.module.css";
import { DropZoneSlot } from "@/components/cv-drop/drop-zone-slot";
import s from "./sections.module.css";

/** The close: the primary action again, and the promise that silence is an answer too. */
export async function Close() {
  const t = await getTranslations("Landing.close");

  return (
    <section className={`${s.section} ${styles.close}`} aria-labelledby="close-title">
      <h2 id="close-title" className={styles.title}>
        {t("title")}
      </h2>
      <DropZoneSlot className={styles.action} />
      <p className={styles.last}>{t("last")}</p>
    </section>
  );
}
