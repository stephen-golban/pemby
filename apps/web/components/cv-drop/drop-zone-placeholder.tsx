import { useTranslations } from "next-intl";
import { useId } from "react";
import zone from "@/components/landing/drop-zone.module.css";
import { IdleFace } from "./idle-face";

/**
 * What the slot shows while the server decides whether the CV drop is on: the idle pill exactly as
 * it will be, laid out from the same markup, so nothing under the page's primary action moves when
 * the real one arrives. The pill is inert and the zone is marked busy, so the few milliseconds it
 * is on screen cannot swallow a click or a keystroke.
 */
export function DropZonePlaceholder({ className }: { className?: string }) {
  const t = useTranslations("Landing.drop");
  const captionId = useId();
  return (
    <div
      className={[zone.zone, className].filter(Boolean).join(" ")}
      data-mode="idle"
      aria-busy="true"
    >
      <button
        type="button"
        className={zone.trigger}
        disabled
        tabIndex={-1}
        aria-describedby={captionId}
      >
        <IdleFace />
      </button>
      <p id={captionId} className={zone.caption}>
        {t("caption")}
      </p>
    </div>
  );
}
