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
} from "@/app/profile/_shared/fields";
import styles from "./kit.module.css";

/**
 * The application defaults, asked here rather than in a settings page (PLAN D5: company
 * preferences and application defaults are asked later, **in context**).
 *
 * The context is the first kit. These are the four answers every application form wants and no
 * onboarding step has any business collecting up front, because at that point the person has not
 * seen a single role yet. They are asked once, stored on the profile, and reused on every kit
 * afterwards.
 *
 * This ledger is the only place in the product that shows them, so `/kit/[jobId]` keeps it after
 * the first time through, behind the "Change" disclosure in `app/kit/[jobId]/kit-client.tsx`. Each
 * row saves on its own and none of them retires the form: the page's "Save and continue" does
 * that, once, and a row left at "Not answered" is a fine way to leave it.
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
        // Two radios with a third state — neither of them — rather than `YesNoEditor`.
        //
        // `YesNoEditor` takes a plain boolean, so an unanswered row opens with "No" already
        // selected, and clicking the answer you meant fires no change event: "No" was unsavable
        // on exactly the rows that had never been answered. `ChoiceEditor` with a null value
        // checks neither radio, so the row shows honestly that nothing has been said yet and
        // either answer is one tap. It is the same primitive underneath (`YesNoEditor` is a thin
        // wrapper over it), imported rather than reimplemented.
        <ChoiceEditor<"yes" | "no">
          legend={t(`workAuth.${question}`)}
          options={[
            { value: "yes", label: shared("yes") },
            { value: "no", label: shared("no") },
          ]}
          value={answer === undefined ? null : answer ? "yes" : "no"}
          onChange={(next) => {
            // Never null: there is no clear option here. Leaving the row alone is how you skip it.
            if (next !== null) onChange(next === "yes");
          }}
        />
      )}
    />
  );
}
