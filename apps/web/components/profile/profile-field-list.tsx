"use client";

import type { EnglishLevel, ParsedProfilePartial, ProfileLinkKind, Seniority } from "@pemby/core";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { cleanStrings, completeLanguages, completeLinks, shortUrl, useCountryName } from "./format";
import { ProfileChip, ProfileChipList } from "./profile-chip";
import styles from "./profile.module.css";

export const PROFILE_FIELDS = [
  "name",
  "titles",
  "seniority",
  "experience",
  "stack",
  "domains",
  "location",
  "languages",
  "links",
] as const;
export type ProfileFieldKey = (typeof PROFILE_FIELDS)[number];

// Local copies keep the core package (zod, the eligibility engine) out of the browser bundle.
// `satisfies` fails typecheck if core drops or renames a value; a value core adds shows as not yet
// known until it is listed here and in the messages.
const SENIORITIES = [
  "intern",
  "junior",
  "middle",
  "senior",
  "lead",
  "staff",
  "principal",
] as const satisfies readonly Seniority[];
const ENGLISH_LEVELS = [
  "a1",
  "a2",
  "b1",
  "b2",
  "c1",
  "c2",
  "native",
] as const satisfies readonly EnglishLevel[];

function isSeniority(value: unknown): value is Seniority {
  return (SENIORITIES as readonly unknown[]).includes(value);
}

const LINK_KINDS = [
  "github",
  "linkedin",
  "portfolio",
  "other",
] as const satisfies readonly ProfileLinkKind[];

function isLinkKind(value: unknown): value is ProfileLinkKind {
  return (LINK_KINDS as readonly unknown[]).includes(value);
}

function isLevel(value: unknown): value is EnglishLevel {
  return (ENGLISH_LEVELS as readonly unknown[]).includes(value);
}

/**
 * The parsed profile as a hairline-ruled ledger: an uppercase mono label beside each value.
 *
 * `streaming`: fields the CV reader has not reached yet show a dashed "not yet" slot, so rows keep
 * their place and each value arrives in its own row without the list jumping. `complete`: a field
 * the CV does not state says so plainly. Values that arrive animate in once (none under reduced
 * motion). Reused by onboarding and the profile page; `fields` picks and orders the rows, and
 * `renderAction` adds a per-row control (an edit button) without this list knowing about editing.
 */
export function ProfileFieldList({
  profile,
  state,
  fields = PROFILE_FIELDS,
  renderAction,
  labelledBy,
}: {
  profile: ParsedProfilePartial | null;
  state: "streaming" | "complete";
  fields?: readonly ProfileFieldKey[];
  renderAction?: (field: ProfileFieldKey) => ReactNode;
  labelledBy?: string;
}) {
  const t = useTranslations("Cv.profile");
  const countryName = useCountryName();

  function value(field: ProfileFieldKey): ReactNode {
    const p = profile;
    switch (field) {
      case "name":
        return p?.fullName ? <span className={styles.name}>{p.fullName}</span> : null;
      case "titles": {
        const titles = cleanStrings(p?.titles);
        return titles.length > 0 ? (
          <ul className={styles.inlineList}>
            {titles.map((title, i) => (
              <li key={`${i}-${title}`} className={styles.arrive}>
                {title}
              </li>
            ))}
          </ul>
        ) : null;
      }
      case "seniority":
        return isSeniority(p?.seniority) ? t(`seniority.${p.seniority}`) : null;
      case "experience":
        return typeof p?.yearsExperience === "number"
          ? t("years", { years: p.yearsExperience })
          : null;
      case "stack":
      case "domains": {
        const items = cleanStrings(field === "stack" ? p?.stack : p?.domains);
        return items.length > 0 ? (
          <ProfileChipList label={t(`fields.${field}`)}>
            {items.map((item, i) => (
              <ProfileChip key={`${i}-${item}`}>{item}</ProfileChip>
            ))}
          </ProfileChipList>
        ) : null;
      }
      case "location": {
        const city = p?.location?.city || null;
        const country = p?.location?.country?.length === 2 ? countryName(p.location.country) : null;
        const parts = [city, country].filter(Boolean);
        if (parts.length === 0) return null;
        return (
          <>
            {parts.join(", ")}
            {p?.timezoneGuess ? (
              <span className={styles.aside}>{t("timezone", { zone: p.timezoneGuess })}</span>
            ) : null}
          </>
        );
      }
      case "languages": {
        const languages = completeLanguages(p);
        return languages.length > 0 ? (
          <ProfileChipList label={t("fields.languages")}>
            {languages.map((l, i) => (
              <ProfileChip
                key={`${i}-${l.name}`}
                detail={isLevel(l.level) ? t(`levels.${l.level}`) : undefined}
              >
                {l.name}
              </ProfileChip>
            ))}
          </ProfileChipList>
        ) : null;
      }
      case "links": {
        const links = completeLinks(p);
        return links.length > 0 ? (
          <ul className={styles.links}>
            {links.map((link, i) => (
              <li key={`${i}-${link.url}`} className={styles.arrive}>
                <span className={styles.linkKind}>
                  {t(`linkKinds.${isLinkKind(link.kind) ? link.kind : "other"}`)}
                </span>{" "}
                <a href={link.url} rel="noopener noreferrer nofollow" target="_blank">
                  {shortUrl(link.url)}
                </a>
              </li>
            ))}
          </ul>
        ) : null;
      }
    }
  }

  return (
    <dl className={styles.ledger} aria-labelledby={labelledBy} data-state={state}>
      {fields.map((field) => {
        const content = value(field);
        return (
          <div key={field} className={styles.row} data-field={field} data-filled={content !== null}>
            <dt className={styles.label}>{t(`fields.${field}`)}</dt>
            <dd className={styles.value}>
              {content !== null ? (
                <div className={styles.arrive}>{content}</div>
              ) : state === "streaming" ? (
                <span className={styles.slot}>{t("pending")}</span>
              ) : (
                <span className={styles.missing}>{t("missing")}</span>
              )}
            </dd>
            {renderAction ? <dd className={styles.action}>{renderAction(field)}</dd> : null}
          </div>
        );
      })}
    </dl>
  );
}
