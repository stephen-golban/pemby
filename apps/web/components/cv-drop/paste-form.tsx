"use client";

import { useTranslations } from "next-intl";
import { useId } from "react";
import type { FormEvent } from "react";
import { CV_TEXT_MAX_CHARS, CV_TEXT_MIN_CHARS } from "./api";
import styles from "./cv-drop.module.css";

/**
 * The fallback when a file has no text to read: paste the CV instead. Controlled from the parent
 * so a failed submission can be rolled back with the text still in the box.
 */
export function PasteForm({
  value,
  onChange,
  onSubmit,
  pending,
  error,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  pending: boolean;
  error: string | null;
}) {
  const t = useTranslations("Cv.unreadable");
  const fieldId = useId();
  const hintId = useId();
  const short = value.trim().length < CV_TEXT_MIN_CHARS;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!short && !pending) onSubmit();
  }

  return (
    <form className={styles.paste} onSubmit={submit}>
      <label className={styles.pasteLabel} htmlFor={fieldId}>
        {t("label")}
      </label>
      <textarea
        id={fieldId}
        className={styles.textarea}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        maxLength={CV_TEXT_MAX_CHARS}
        rows={7}
        spellCheck={false}
        aria-describedby={hintId}
        placeholder=""
      />
      <p id={hintId} className={styles.pasteHint}>
        {t("hint")}{" "}
        <span className={styles.count} data-short={short}>
          {t("count", { count: value.trim().length })}
        </span>
      </p>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      <button type="submit" className={styles.primary} disabled={short || pending}>
        {pending ? t("sending") : t("submit")}
      </button>
    </form>
  );
}
