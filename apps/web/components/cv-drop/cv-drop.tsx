"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useFormatter, useTranslations } from "next-intl";
import Link from "next/link";
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import type { DragEvent } from "react";
import { ProfileFieldList, TeaserResults, useCountryName } from "@/components/profile";
import zone from "@/components/landing/drop-zone.module.css";
import {
  CvRequestError,
  cvIdStore,
  cvKey,
  deleteCv,
  getCv,
  getTeaser,
  isPolling,
  postCvFile,
  postCvText,
  precheckFile,
  teaserKey,
  type CvClientError,
  type CvStatus,
} from "./api";
import styles from "./cv-drop.module.css";
import { ensureSession, useHumanCheck } from "./human-check";
import { IdleFace } from "./idle-face";
import { PasteForm } from "./paste-form";
import { ProgressSteps } from "./progress-steps";

type Source = "file" | "text";

type Flow =
  /** Nothing dropped yet (or the visitor started over). */
  | { kind: "idle" }
  /** Optimistic: the card and the reading state are on screen before the request comes back. */
  | { kind: "sending"; label: string; source: Source }
  | { kind: "tracking"; cvId: string; label: string; source: Source; resumed: boolean };

/** What the panel says it is doing; the API statuses plus the two client-only ones. */
type ViewStatus = CvStatus | "sending" | "resuming";

const READING_STATUSES: ViewStatus[] = ["sending", "resuming", "uploaded", "extracting", "parsing"];

function stepOf(status: ViewStatus, teaserDone: boolean): number {
  if (status === "extracting") return 1;
  if (status === "parsing" || status === "queued") return 2;
  if (status === "parsed") return teaserDone ? 4 : 3;
  return 0;
}

function codeOf(error: unknown): CvClientError {
  return error instanceof CvRequestError ? error.code : "unavailable";
}

function lostSession(error: unknown): boolean {
  return (
    error instanceof CvRequestError &&
    (error.code === "not_found" || error.code === "unauthenticated")
  );
}

/**
 * The working CV drop (phase 06). Everything the visitor does lands on screen at once: the file
 * card and the reading state appear on drop, before the upload has answered, and roll back to the
 * idle zone with a plain message when it fails. While the CV is being read the profile fills in
 * field by field from the streamed partial, and the teaser follows the moment it is parsed.
 *
 * The zone renders twice on the landing page, so every id comes from `useId` and only the instance
 * asked to `resume` picks the tab's CV back up after a reload.
 */
export function CvDrop({
  className,
  siteKey,
  resume,
}: {
  className?: string;
  siteKey: string;
  resume: boolean;
}) {
  const t = useTranslations("Cv");
  const tDrop = useTranslations("Landing.drop");
  const format = useFormatter();
  const countryName = useCountryName();
  const queryClient = useQueryClient();
  const human = useHumanCheck(siteKey);

  // The flow the visitor started in this instance; null means "whatever the tab's stored CV says".
  const [started, setStarted] = useState<Flow | null>(null);
  const [error, setError] = useState<CvClientError | null>(null);
  const [draft, setDraft] = useState("");
  const [pasting, setPasting] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [hasFile, setHasFile] = useState(false);

  const dragDepth = useRef(0);
  const lastFile = useRef<File | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const moveFocus = useRef<"trigger" | "heading" | null>(null);

  const captionId = useId();
  const headingId = useId();
  const teaserId = useId();

  // Resume: the API is the source of truth, the stored id only says which CV to ask about.
  const stored = useSyncExternalStore(cvIdStore.subscribe, cvIdStore.read, cvIdStore.readServer);
  const flow: Flow =
    started ??
    (resume && stored
      ? { kind: "tracking", cvId: stored, label: "", source: "file", resumed: true }
      : { kind: "idle" });

  const cvId = flow.kind === "tracking" ? flow.cvId : null;
  const cv = useQuery({
    queryKey: cvKey(cvId ?? "none"),
    queryFn: async () => {
      try {
        return await getCv(cvId ?? "");
      } catch (requestError) {
        // Deleted, expired, or the session ended: stop pointing at it.
        if (lostSession(requestError)) cvIdStore.clear();
        throw requestError;
      }
    },
    enabled: cvId !== null,
    refetchInterval: (query) =>
      lostSession(query.state.error) || !isPolling(query.state.data?.status) ? false : 700,
    retry: (count, queryError) => !lostSession(queryError) && count < 5,
    refetchOnWindowFocus: true,
  });

  // A CV that is gone takes the panel with it: the zone comes back, and someone who just dropped a
  // file is told why (a visitor who only reloaded the page is not).
  const lost = cvId !== null && lostSession(cv.error);
  const data = lost ? undefined : cv.data;
  const visible: Flow = lost ? { kind: "idle" } : flow;
  const status: ViewStatus =
    visible.kind === "tracking"
      ? (data?.status ?? (visible.resumed ? "resuming" : "uploaded"))
      : "sending";

  const teaser = useQuery({
    queryKey: teaserKey(cvId ?? "none"),
    queryFn: getTeaser,
    enabled: cvId !== null && status === "parsed",
    retry: (count, queryError) => !lostSession(queryError) && count < 2,
  });

  useEffect(() => {
    if (moveFocus.current === "heading") heading.current?.focus();
    if (moveFocus.current === "trigger") trigger.current?.focus();
    moveFocus.current = null;
  });

  const submit = useMutation({
    mutationFn: async (vars: { source: Source; file?: File; text?: string }) => {
      // Both in flight at once: the token is usually already waiting, and the anonymous session
      // costs one round trip at most.
      const [token] = await Promise.all([
        human.token(vars.source === "file" ? "cv_upload" : "cv_text"),
        ensureSession(),
      ]);
      try {
        return vars.source === "file" && vars.file
          ? await postCvFile(vars.file, token)
          : await postCvText(vars.text ?? "", token);
      } finally {
        human.consumed();
      }
    },
    onMutate: (vars) => {
      const previous = visible;
      setError(null);
      moveFocus.current = previous.kind === "idle" ? "heading" : null;
      setStarted({
        kind: "sending",
        label:
          vars.source === "file" ? (vars.file?.name ?? t("file.fallbackName")) : t("file.pasted"),
        source: vars.source,
      });
      return { previous };
    },
    onError: (submitError, _vars, context) => {
      // Rollback: whatever was on screen before the drop comes back, with the reason under it.
      setStarted(context?.previous ?? { kind: "idle" });
      if ((context?.previous ?? { kind: "idle" }).kind === "idle") moveFocus.current = "trigger";
      setError(codeOf(submitError));
    },
    onSuccess: ({ cvId: id }, vars) => {
      cvIdStore.write(id);
      setPasting(false);
      setStarted({
        kind: "tracking",
        cvId: id,
        label:
          vars.source === "file" ? (vars.file?.name ?? t("file.fallbackName")) : t("file.pasted"),
        source: vars.source,
        resumed: false,
      });
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteCv(id),
    onMutate: (id: string) => {
      const previous = visible;
      cvIdStore.clear();
      setError(null);
      setPasting(false);
      moveFocus.current = "trigger";
      setStarted({ kind: "idle" });
      queryClient.removeQueries({ queryKey: cvKey(id) });
      queryClient.removeQueries({ queryKey: teaserKey(id) });
      return { previous };
    },
    onError: (deleteError, id, context) => {
      if (context?.previous) {
        setStarted(context.previous);
        if (context.previous.kind === "tracking") cvIdStore.write(id);
      }
      setError(codeOf(deleteError));
    },
  });

  function startFile(file: File) {
    const refused = precheckFile(file);
    if (refused) {
      setError(refused);
      moveFocus.current = null;
      return;
    }
    lastFile.current = file;
    setHasFile(true);
    submit.mutate({ source: "file", file });
  }

  function startOver() {
    cvIdStore.clear();
    setError(null);
    setPasting(false);
    setDraft("");
    setHasFile(false);
    lastFile.current = null;
    moveFocus.current = "trigger";
    setStarted({ kind: "idle" });
  }

  function isFileDrag(event: DragEvent) {
    return Array.from(event.dataTransfer.types).includes("Files");
  }

  const idle = visible.kind === "idle";
  const mode = idle ? (dragging ? "dragging" : "idle") : "active";

  const partial = data?.parsed ?? data?.partial ?? null;
  const teaserCountry = teaser.data
    ? (countryName(teaser.data.country) ?? teaser.data.countryName)
    : null;
  const teaserState = teaser.isError ? "error" : teaser.data ? "ready" : "loading";
  const reading = READING_STATUSES.includes(status);
  const label =
    visible.kind === "idle"
      ? ""
      : visible.label || (data?.source === "text" ? t("file.pasted") : t("file.fallbackName"));

  const idleError =
    error ?? (lost && flow.kind === "tracking" && !flow.resumed ? "not_found" : null);

  const announcement = idle
    ? idleError
      ? t(`errors.${idleError}`)
      : ""
    : status === "parsed" && teaser.data
      ? t("announce.teaserReady", {
          count: teaser.data.count ?? 0,
          country: teaserCountry ?? t("teaser.yourCountry"),
        })
      : t(`status.${status}`);

  return (
    <div
      className={[zone.zone, styles.zone, className].filter(Boolean).join(" ")}
      data-mode={mode}
      onDragEnter={(event) => {
        if (!idle || !isFileDrag(event)) return;
        event.preventDefault();
        dragDepth.current += 1;
        human.warm();
        setDragging(true);
      }}
      onDragOver={(event) => {
        if (!isFileDrag(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = idle ? "copy" : "none";
      }}
      onDragLeave={(event) => {
        if (!idle || !isFileDrag(event)) return;
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        dragDepth.current = 0;
        setDragging(false);
        const file = event.dataTransfer.files[0];
        if (idle && file) startFile(file);
      }}
      onPointerEnter={human.warm}
    >
      <input
        ref={input}
        className="visually-hidden"
        type="file"
        accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) startFile(file);
        }}
      />

      <p className="visually-hidden" role="status" aria-live="polite">
        {announcement}
      </p>

      {idle ? (
        <div className={styles.idle}>
          <button
            ref={trigger}
            type="button"
            className={zone.trigger}
            // The caption sits inside the button for the bigger target, so the name is set
            // explicitly and the caption stays the description.
            aria-label={tDrop("title")}
            aria-describedby={captionId}
            onFocus={human.warm}
            onClick={() => input.current?.click()}
          >
            <IdleFace captionId={captionId} dragging={dragging} />
          </button>
          {idleError ? (
            <p className={styles.error} role="alert">
              {t(`errors.${idleError}`)}
            </p>
          ) : null}
        </div>
      ) : (
        <div className={styles.panel}>
          <header className={styles.fileRow}>
            <span className={styles.fileGlyph} aria-hidden="true">
              <svg viewBox="0 0 24 24" focusable="false">
                <path
                  d="M6 2.8h7.2L18.4 8v13.2H6z M13.2 2.8V8h5.2"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <span className={styles.fileName}>{label}</span>
            <button type="button" className={styles.pill} onClick={startOver}>
              {t("file.startOver")}
            </button>
          </header>

          {status === "unreadable" || status === "failed" ? null : (
            <ProgressSteps current={stepOf(status, teaserState === "ready")} />
          )}

          <h2 ref={heading} id={headingId} tabIndex={-1} className={styles.panelTitle}>
            {t(`status.${status}`)}
          </h2>

          {reading ? <p className={styles.lead}>{t("lead.reading")}</p> : null}

          {status === "queued" ? (
            <div className={styles.notice}>
              <p>
                {data?.queuedUntil
                  ? t("queued.body", {
                      time: format.dateTime(new Date(data.queuedUntil), {
                        hour: "numeric",
                        minute: "2-digit",
                      }),
                    })
                  : t("queued.bodyNoTime")}
              </p>
              <p className={styles.note}>{t("queued.note")}</p>
            </div>
          ) : null}

          {status === "unreadable" || (status === "failed" && pasting) ? (
            <div className={styles.notice}>
              <p>{status === "unreadable" ? t("unreadable.body") : t("failed.body")}</p>
              <PasteForm
                value={draft}
                onChange={setDraft}
                onSubmit={() => submit.mutate({ source: "text", text: draft.trim() })}
                pending={submit.isPending}
                error={error ? t(`errors.${error}`) : null}
              />
              <button type="button" className={styles.pill} onClick={() => input.current?.click()}>
                {t("unreadable.chooseFile")}
              </button>
            </div>
          ) : null}

          {status === "failed" && !pasting ? (
            <div className={styles.notice}>
              <p>{t("failed.body")}</p>
              {error ? (
                <p className={styles.error} role="alert">
                  {t(`errors.${error}`)}
                </p>
              ) : null}
              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.primary}
                  onClick={() => {
                    const file = lastFile.current;
                    if (file) submit.mutate({ source: "file", file });
                    else input.current?.click();
                  }}
                >
                  {hasFile ? t("failed.retry") : t("failed.chooseFile")}
                </button>
                <button type="button" className={styles.pill} onClick={() => setPasting(true)}>
                  {t("failed.paste")}
                </button>
              </div>
            </div>
          ) : null}

          {reading || status === "queued" || status === "parsed" ? (
            <>
              {status === "parsed" ? <p className={styles.lead}>{t("lead.parsed")}</p> : null}
              <ProfileFieldList
                profile={partial}
                state={status === "parsed" ? "complete" : "streaming"}
                labelledBy={headingId}
              />
            </>
          ) : null}

          {status === "parsed" ? (
            <TeaserResults
              state={teaserState}
              result={teaser.data}
              countryLabel={teaserCountry}
              headingId={teaserId}
              onRetry={() => void teaser.refetch()}
              footer={
                <div className={styles.save}>
                  <h3 className={styles.saveTitle}>{t("save.title")}</h3>
                  <p className={styles.saveBody}>{t("save.body")}</p>
                  <div className={styles.actions}>
                    <Link className={styles.primary} href="/sign-up">
                      {t("save.cta")}
                    </Link>
                    <Link className={styles.textLink} href="/sign-in">
                      {t("save.signIn")}
                    </Link>
                  </div>
                </div>
              }
            />
          ) : null}

          {cvId && (status === "parsed" || status === "unreadable" || status === "failed") ? (
            <button
              type="button"
              className={styles.quiet}
              disabled={remove.isPending}
              onClick={() => remove.mutate(cvId)}
            >
              {t("save.delete")}
            </button>
          ) : null}
        </div>
      )}

      <div className={styles.human} data-interactive={human.interactive}>
        {human.interactive ? <p className={styles.note}>{t("human")}</p> : null}
        {human.widget}
      </div>
    </div>
  );
}
