"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { QuietView } from "@/app/api/channels/_lib/view";
import { FieldRow, TimezoneEditor } from "@/app/profile/_shared/fields";
import fields from "@/app/profile/_shared/fields.module.css";
import styles from "./channels.module.css";

/** Minutes after local midnight as the 24-hour clock an `<input type="time">` speaks. */
function toClock(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}

/** The same trip back. Anything that is not `HH:MM` is not a time and is refused, not guessed. */
function toMinutes(clock: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(clock);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function browserZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return null;
  }
}

/**
 * Quiet hours (PLAN D8): the window in the person's own local time when nothing is sent.
 *
 * One row, not three, because it is one decision. A start with no end and no zone is not a quiet
 * window — `isWithinQuietHours` in `@pemby/core` reads a partly-filled one as "no quiet hours",
 * which is the opposite of what someone who has just typed a start time means — so the editor holds
 * its three controls locally and commits only when all three say something, and the server refuses
 * the partial shape as well.
 *
 * A window may cross midnight; 22:00 to 07:00 is the common one. Nothing special happens here for
 * it — two ordinary minute values whose start is the greater one — and the row says in words that
 * it read them that way, so nobody has to wonder whether it wrapped.
 *
 * The window lives on the channel rows (one per channel, same values), so there is nowhere to store
 * it until a channel exists. When there is none, the editor says so instead of taking an edit that
 * would be silently dropped.
 */
export function QuietHours({
  quiet,
  hasChannels,
  onChange,
}: {
  quiet: QuietView;
  hasChannels: boolean;
  onChange: (next: QuietView | null) => void;
}) {
  const t = useTranslations("Settings.quiet");
  const set = quiet.startMinute !== null && quiet.endMinute !== null && quiet.timezone !== null;

  const [start, setStart] = useState(quiet.startMinute === null ? "" : toClock(quiet.startMinute));
  const [end, setEnd] = useState(quiet.endMinute === null ? "" : toClock(quiet.endMinute));
  const [zone, setZone] = useState<string | null>(quiet.timezone ?? browserZone());

  function commit(next: { start?: string; end?: string; zone?: string | null }) {
    const from = next.start ?? start;
    const until = next.end ?? end;
    const where = next.zone === undefined ? zone : next.zone;
    if (next.start !== undefined) setStart(next.start);
    if (next.end !== undefined) setEnd(next.end);
    if (next.zone !== undefined) setZone(next.zone);

    const startMinute = toMinutes(from);
    const endMinute = toMinutes(until);
    if (startMinute === null || endMinute === null || !where) return;
    if (startMinute === endMinute) return;
    onChange({ startMinute, endMinute, timezone: where });
  }

  function clear() {
    setStart("");
    setEnd("");
    onChange(null);
  }

  const clash = start !== "" && start === end;

  const value = set ? (
    <>
      <span className={styles.window}>
        {t("window", {
          from: toClock(quiet.startMinute ?? 0),
          until: toClock(quiet.endMinute ?? 0),
        })}
      </span>
      <span className={styles.zone}>{quiet.timezone}</span>
    </>
  ) : null;

  return (
    <FieldRow
      id="settings-quiet"
      label={t("label")}
      help={hasChannels ? t("help") : t("needsChannel")}
      filled={set}
      value={value}
      empty={t("none")}
      editor={() => (
        <fieldset className={fields.fieldset} disabled={!hasChannels}>
          <legend className="visually-hidden">{t("label")}</legend>
          <label className={fields.inlineLabel}>
            <span className={styles.timeLabel}>{t("from")}</span>
            <input
              className={styles.time}
              type="time"
              value={start}
              onChange={(event) => commit({ start: event.target.value })}
            />
          </label>
          <label className={fields.inlineLabel}>
            <span className={styles.timeLabel}>{t("until")}</span>
            <input
              className={styles.time}
              type="time"
              value={end}
              onChange={(event) => commit({ end: event.target.value })}
            />
          </label>
          <TimezoneEditor
            legend={t("zone")}
            value={zone}
            onChange={(next) => commit({ zone: next })}
          />
          {set ? (
            <button type="button" className={fields.pill} onClick={clear}>
              {t("clear")}
            </button>
          ) : null}
          {clash ? (
            <p className={styles.note} role="alert">
              {t("sameTime")}
            </p>
          ) : null}
        </fieldset>
      )}
    />
  );
}

/** The one line under the ledger that says what a wrapped window means. Shown only when it wraps. */
export function QuietWrapNote({ quiet }: { quiet: QuietView }) {
  const t = useTranslations("Settings.quiet");
  if (quiet.startMinute === null || quiet.endMinute === null) return null;
  if (quiet.startMinute <= quiet.endMinute) return null;
  return <p className={styles.note}>{t("wraps", { until: toClock(quiet.endMinute) })}</p>;
}
