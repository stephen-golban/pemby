"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { DELETE_CONFIRMATION } from "@/app/api/profile/_lib/view";
import { EXPORT_PATH, errorCodeOf, postAccountDelete, type ProfileClientError } from "./api";
import styles from "./panels.module.css";

/** "Export my data": a JSON file the server builds from the caller's own rows. */
export function ExportPanel() {
  const t = useTranslations("Onboarding.data");
  return (
    <section id="profile-export" className={styles.panel} aria-labelledby="profile-export-title">
      <h2 id="profile-export-title" className={styles.panelTitle}>
        {t("title")}
      </h2>
      <p className={styles.body}>{t("body")}</p>
      <ul className={styles.plainList}>
        <li>{t("includesProfile")}</li>
        <li>{t("includesParsed")}</li>
        <li>{t("includesFiles")}</li>
      </ul>
      <p className={styles.note}>{t("excludes")}</p>
      {/* A plain download: the route answers with Content-Disposition, so no script is involved. */}
      <a className={styles.pill} href={EXPORT_PATH} download>
        {t("cta")}
      </a>
    </section>
  );
}

/**
 * "Delete account", in the page rather than in a modal: the decision needs reading, not
 * interruption. The button stays unavailable until the confirmation phrase is typed exactly, and
 * the phrase is a fixed protocol value the sentence around it interpolates, so a translated prompt
 * still validates on the server.
 *
 * Optimistic, like every other mutation here: the panel goes to its pending state at once and
 * comes back with the reason if the server refuses.
 */
export function DeletePanel({ anonymous }: { anonymous: boolean }) {
  const t = useTranslations("Onboarding.delete");
  const errors = useTranslations("Onboarding.errors");
  const router = useRouter();
  const queryClient = useQueryClient();
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<ProfileClientError | null>(null);
  const [gone, setGone] = useState(false);

  const remove = useMutation({
    mutationFn: postAccountDelete,
    onMutate: () => {
      setError(null);
      setGone(true);
    },
    onError: (failure) => {
      setGone(false);
      setError(errorCodeOf(failure));
    },
    onSuccess: () => {
      // The session rows are gone and the cookies are expired. Drop everything this tab cached
      // about the account before leaving, so no personal data survives the navigation.
      queryClient.clear();
      router.replace("/");
      router.refresh();
    },
  });

  const ready = typed.trim() === DELETE_CONFIRMATION;

  return (
    <section id="profile-delete" className={styles.card} aria-labelledby="profile-delete-title">
      <h2 id="profile-delete-title" className={styles.cardTitle}>
        {t("title")}
      </h2>
      <p className={styles.body}>{anonymous ? t("bodyAnonymous") : t("body")}</p>
      <ul className={styles.plainList}>
        <li>{t("removesProfile")}</li>
        <li>{t("removesFiles")}</li>
        <li>{t("removesAccount")}</li>
      </ul>
      <p className={styles.note}>{t("permanent")}</p>

      <form
        className={styles.confirmRow}
        onSubmit={(event) => {
          event.preventDefault();
          if (ready && !gone) remove.mutate(typed.trim());
        }}
      >
        <label className={styles.confirmLabel}>
          <span>{t("prompt", { phrase: DELETE_CONFIRMATION })}</span>
          <input
            className={styles.confirmInput}
            type="text"
            value={typed}
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => setTyped(event.target.value)}
          />
        </label>
        <button type="submit" className={styles.danger} disabled={!ready || gone}>
          {gone ? t("deleting") : t("cta")}
        </button>
      </form>
      {error ? (
        <p className={styles.error} role="alert">
          {errors(error)}
        </p>
      ) : null}
    </section>
  );
}

/**
 * The 24-hour notice for a visitor who has not signed up yet (PLAN D4). Reuses the CV drop's own
 * wording so the promise reads the same on both surfaces.
 */
export function SaveWorkPanel() {
  const t = useTranslations("Cv.save");
  return (
    <section id="profile-save" className={styles.card} aria-labelledby="profile-save-title">
      <h2 id="profile-save-title" className={styles.cardTitle}>
        {t("title")}
      </h2>
      <p className={styles.body}>{t("body")}</p>
      <div className={styles.cardActions}>
        <Link className={styles.primary} href="/sign-up">
          {t("cta")}
        </Link>
        <Link className={styles.textLink} href="/sign-in">
          {t("signIn")}
        </Link>
      </div>
    </section>
  );
}
