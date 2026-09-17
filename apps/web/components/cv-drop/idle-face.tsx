import { useTranslations } from "next-intl";
import zone from "@/components/landing/drop-zone.module.css";
import styles from "./cv-drop.module.css";

/**
 * The inside of the idle drop zone: glyph, title, the "or choose a file" line and the caption.
 * Shared by the working zone and by the placeholder the slot streams in front of it, so both are
 * laid out from the same markup and the colour band below the zone never shifts between them.
 */
export function IdleFace({
  captionId,
  dragging = false,
}: {
  captionId: string;
  dragging?: boolean;
}) {
  const t = useTranslations("Landing.drop");
  return (
    <>
      <svg className={zone.glyph} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
        <path
          d="M16 20V5m0 0-6.5 6.5M16 5l6.5 6.5M5 18.5V25a2 2 0 0 0 2 2h18a2 2 0 0 0 2-2v-6.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className={zone.title}>{dragging ? t("dragging") : t("title")}</span>
      <span className={styles.choose}>{t("liveChoose")}</span>
      <span id={captionId} className={zone.caption}>
        {t("liveCaption")}
      </span>
    </>
  );
}
