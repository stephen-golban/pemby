import { useTranslations } from "next-intl";
import zone from "@/components/landing/drop-zone.module.css";

/**
 * The inside of the idle drop pill: the file prompt, a hairline divider, the country and the solid
 * black circle. Shared by the working zone, by the stand-in and by the placeholder the slot streams
 * in front of it, so all three are laid out from the same markup and nothing under the pill shifts
 * when one replaces another.
 *
 * The country, not the file formats: what Pemby checks a role against is the thing worth saying in
 * the page's one act. The formats and the limit are in the caption under the pill, which is the
 * pill's own description.
 */
export function IdleFace({ dragging = false }: { dragging?: boolean }) {
  const t = useTranslations("Landing.drop");
  return (
    <>
      <span className={zone.title}>{dragging ? t("dragging") : t("title")}</span>
      <span className={zone.divider} aria-hidden="true" />
      <span className={zone.country}>{t("country")}</span>
      <span className={zone.go} aria-hidden="true">
        <svg className={zone.glyph} viewBox="0 0 24 24" focusable="false">
          <path
            d="M12 19V5m0 0-6.2 6.2M12 5l6.2 6.2"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    </>
  );
}
