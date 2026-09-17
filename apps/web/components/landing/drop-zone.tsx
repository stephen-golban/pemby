"use client";

import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";
import type { DragEvent } from "react";
import { CvDrop } from "@/components/cv-drop/cv-drop";
import styles from "./drop-zone.module.css";

const TELEGRAM_URL = "https://t.me/pemby_jobs";

type Mode = "idle" | "dragging" | "pending";

/**
 * The landing page's drop zone. With `live` (the server found the CV drop switched on, see
 * `DropZoneSlot`) it is the working CV drop: the file is read, the profile fills in, and the
 * teaser follows. Without it, it is the stand-in: it accepts a click, a key press or a dropped
 * file but never reads or uploads anything, and says inline that CV reading is not switched on
 * on this site. The stand-in has no mutation, so there is nothing to roll back.
 */
export function DropZone({
  className,
  live,
}: {
  className?: string;
  live?: { siteKey: string; resume: boolean };
}) {
  if (live) return <CvDrop className={className} siteKey={live.siteKey} resume={live.resume} />;
  return <StandInDropZone className={className} />;
}

function StandInDropZone({ className }: { className?: string }) {
  const t = useTranslations("Landing.drop");
  const [mode, setMode] = useState<Mode>("idle");
  const depth = useRef(0);
  const pendingHeading = useRef<HTMLParagraphElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const returning = useRef(false);
  // The zone appears twice on the landing page (hero and close), so its ids must be unique.
  const captionId = useId();

  useEffect(() => {
    if (mode === "pending") pendingHeading.current?.focus();
    if (mode === "idle" && returning.current) {
      returning.current = false;
      trigger.current?.focus();
    }
  }, [mode]);

  function isFileDrag(event: DragEvent) {
    return Array.from(event.dataTransfer.types).includes("Files");
  }

  function onDragEnter(event: DragEvent) {
    if (!isFileDrag(event) || mode === "pending") return;
    event.preventDefault();
    depth.current += 1;
    setMode("dragging");
  }

  function onDragOver(event: DragEvent) {
    if (!isFileDrag(event)) return;
    // Required for the drop to be accepted instead of the browser opening the file.
    event.preventDefault();
    event.dataTransfer.dropEffect = mode === "pending" ? "none" : "copy";
  }

  function onDragLeave(event: DragEvent) {
    if (!isFileDrag(event) || mode === "pending") return;
    depth.current = Math.max(0, depth.current - 1);
    if (depth.current === 0) setMode("idle");
  }

  function onDrop(event: DragEvent) {
    // The file is deliberately left untouched: no FileReader, no upload.
    event.preventDefault();
    depth.current = 0;
    setMode("pending");
  }

  return (
    <div
      className={[styles.zone, className].filter(Boolean).join(" ")}
      data-mode={mode}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {mode === "pending" ? (
        <div className={styles.pending} role="status">
          <p ref={pendingHeading} tabIndex={-1} className={styles.pendingTitle}>
            {t("pendingTitle")}
          </p>
          <p className={styles.caption}>{t("pendingBody")}</p>
          <div className={styles.pendingActions}>
            <a
              className={styles.link}
              href={TELEGRAM_URL}
              rel="noopener noreferrer"
              target="_blank"
            >
              {t("pendingLink")}
            </a>
            <button
              type="button"
              className={styles.back}
              onClick={() => {
                returning.current = true;
                setMode("idle");
              }}
            >
              {t("pendingBack")}
            </button>
          </div>
        </div>
      ) : (
        <button
          ref={trigger}
          type="button"
          className={styles.trigger}
          aria-describedby={captionId}
          onClick={() => setMode("pending")}
        >
          <svg className={styles.glyph} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
            <path
              d="M16 20V5m0 0-6.5 6.5M16 5l6.5 6.5M5 18.5V25a2 2 0 0 0 2 2h18a2 2 0 0 0 2-2v-6.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span className={styles.title}>{mode === "dragging" ? t("dragging") : t("title")}</span>
          <span id={captionId} className={styles.caption}>
            {t("caption")}
          </span>
        </button>
      )}
    </div>
  );
}
