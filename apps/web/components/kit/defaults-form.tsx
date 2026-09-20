"use client";

import { useTranslations } from "next-intl";
import type {
  ApplicationDefaultsPatch,
  ApplicationDefaultsView,
  NoticePeriod,
  WorkAuthQuestion,
} from "@/app/api/kit/_lib/view";
import {
  MAX_DEFAULT_LINKS,
  MAX_LINK_CHARS,
  NOTICE_PERIODS,
  WORK_AUTH_QUESTIONS,
} from "@/app/api/kit/_lib/view";
import {
  ChoiceEditor,
  FieldRow,
  Ledger,
  TextChipsEditor,
  ValueChips,
  YesNoEditor,
} from "@/app/profile/_shared/fields";
import styles from "./kit.module.css";

/**
 * The application defaults, asked here rather than in a settings page (PLAN D5: company
 * preferences and application defaults are asked later, **in context**).
 *
 * The context is the first kit. These are the three answers every application form wants and no
 * onboarding step has any business collecting up front, because at that point the person has not
 * seen a single role yet. They are asked once, stored on the profile, and reused on every kit
 * afterwards — the row stays open here so they can be changed against the post in front of them.
 *
 * The same editable ledger as `/profile` and `/onboarding`: imported from
 * `app/profile/_shared/fields.tsx`, never re-implemented. An outline pill opens each editor in the
 * row — no modal, no drawer, no separate page. Every save is optimistic (`_shared/use-kit.ts`).
 */
export function DefaultsForm({
  defaults,
  labelledBy,
  onChange,
}: {
  defaults: ApplicationDefaultsView;
  labelledBy?: string;
  onChange: (patch: ApplicationDefaultsPatch) => void;
}) {
  const t = useTranslations("Kit.defaults");

  const noticeOptions = NOTICE_PERIODS.map((value) => ({
    value,
    label: t(`noticeValues.${value}`),
  }));

  return (
    <div className={styles.defaults}>
      <Ledger labelledBy={labelledBy}>
        <FieldRow
          label={t("notice")}
          help={t("noticeHelp")}
          filled={defaults.noticePeriod !== null}
          value={defaults.noticePeriod === null ? null : t(`noticeValues.${defaults.noticePeriod}`)}
          empty={t("unanswered")}
          editor={() => (
            <ChoiceEditor<NoticePeriod>
              legend={t("notice")}
              options={noticeOptions}
              value={defaults.noticePeriod}
              clearable
              onChange={(next) => onChange({ noticePeriod: next })}
            />
          )}
        />

        <FieldRow
          label={t("links")}
          help={t("linksHelp")}
          filled={defaults.links.length > 0}
          value={
            defaults.links.length > 0 ? (
              <ValueChips values={defaults.links} label={t("links")} />
            ) : null
          }
          empty={t("noLinks")}
          editor={() => (
            <TextChipsEditor
              legend={t("links")}
              placeholder={t("linksPlaceholder")}
              values={defaults.links}
              max={MAX_DEFAULT_LINKS}
              maxChars={MAX_LINK_CHARS}
              onChange={(next) => onChange({ links: next })}
            />
          )}
        />

        {WORK_AUTH_QUESTIONS.map((question) => (
          <WorkAuthRow
            key={question}
            question={question}
            answer={defaults.workAuthorization[question]}
            onChange={(next) => onChange({ workAuthorization: { [question]: next } })}
          />
        ))}
      </Ledger>

      <p className={styles.defaultsNote}>{t("note")}</p>
    </div>
  );
}

function WorkAuthRow({
  question,
  answer,
  onChange,
}: {
  question: WorkAuthQuestion;
  answer: boolean | undefined;
  onChange: (next: boolean) => void;
}) {
  const t = useTranslations("Kit.defaults");
  const shared = useTranslations("Onboarding.actions");

  return (
    <FieldRow
      label={t(`workAuth.${question}`)}
      help={t(`workAuthHelp.${question}`)}
      filled={answer !== undefined}
      value={answer === undefined ? null : answer ? shared("yes") : shared("no")}
      empty={t("unanswered")}
      editor={() => (
        <YesNoEditor
          legend={t(`workAuth.${question}`)}
          // `YesNoEditor` is a two-way control, so an unanswered row has to open on one of them.
          // "No" is the safer default to show first: it is the answer that claims less about a
          // person, and the row above it says plainly that nothing has been answered yet.
          value={answer ?? false}
          onChange={onChange}
        />
      )}
    />
  );
}
