import { useId } from "react";
import zone from "@/components/landing/drop-zone.module.css";
import { IdleFace } from "./idle-face";

/**
 * What the slot shows while the server decides whether the CV drop is on: the idle zone exactly as
 * it will be, laid out from the same markup, so the colour band under the page's primary action
 * does not move when the real zone arrives. The button is inert and the zone is marked busy, so the
 * few milliseconds it is on screen cannot swallow a click or a keystroke.
 */
export function DropZonePlaceholder({ className }: { className?: string }) {
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
        <IdleFace captionId={captionId} />
      </button>
    </div>
  );
}
