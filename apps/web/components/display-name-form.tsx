"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import type { FormEvent } from "react";
import { optimisticUpdate } from "@/lib/optimistic";
import type { ProfileResponse } from "@/lib/profile";
import styles from "./display-name-form.module.css";

const profileKey = ["profile"] as const;

async function fetchProfile(): Promise<ProfileResponse> {
  const response = await fetch("/api/profile");
  if (!response.ok) throw new Error(`GET /api/profile ${response.status}`);
  return (await response.json()) as ProfileResponse;
}

async function patchDisplayName(displayName: string): Promise<ProfileResponse> {
  const response = await fetch("/api/profile", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ displayName }),
  });
  if (!response.ok) throw new Error(`PATCH /api/profile ${response.status}`);
  return (await response.json()) as ProfileResponse;
}

/** Reference example of the optimistic mutation pattern (docs/conventions.md). */
export function DisplayNameForm({ initial }: { initial: ProfileResponse }) {
  const t = useTranslations("App");
  const [draft, setDraft] = useState(initial.displayName ?? "");

  const profile = useQuery({ queryKey: profileKey, queryFn: fetchProfile, initialData: initial });

  const save = useMutation({
    mutationFn: patchDisplayName,
    // The new name shows at once; on error the snapshot is restored; either way it refetches.
    ...optimisticUpdate<ProfileResponse, string>(profileKey, (previous, displayName) => ({
      ...previous,
      displayName,
    })),
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    save.mutate(draft.trim());
  }

  const name = profile.data.displayName;
  return (
    <section className={styles.card}>
      <p className={styles.current}>
        {name ? t("displayNameCurrent", { name }) : t("displayNameEmpty")}
      </p>
      <form className={styles.form} onSubmit={onSubmit}>
        <label className={styles.label}>
          {t("displayNameLabel")}
          <input
            className={styles.input}
            name="displayName"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            maxLength={80}
            required
          />
        </label>
        <button type="submit" className={styles.submit}>
          {save.isPending ? t("saving") : t("save")}
        </button>
      </form>
      {save.isError ? (
        <p className={styles.error} role="alert">
          {t("saveFailed")}
        </p>
      ) : null}
    </section>
  );
}
