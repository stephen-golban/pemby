"use client";

import { useTranslations } from "next-intl";
import type { KitProvenance } from "@/app/api/kit/_lib/view";
import styles from "./kit.module.css";

/**
 * The AI-generation disclosure, and the machine-readable marking beside it.
 *
 * **Article 50 of Regulation (EU) 2024/1689**, in application since 2026-08-02. Two separate
 * obligations, met by the two halves of this one component so that neither can be shipped without
 * the other:
 *
 *  - **50(1) and 50(5): a visible disclosure, at first exposure, accessible.** The paragraph below
 *    is ordinary text in the document, before any generated sentence — the page renders this
 *    component above the sections and above the button that writes them, so a reader meets it
 *    before the first word and a screen reader reaches it in the same order. `role="note"` rather
 *    than `role="alert"`: this is a statement about what follows, and an alert is a thing people
 *    learn to dismiss.
 *  - **50(2): the generated text is marked in a machine-readable format** as Pemby serves it. The
 *    JSON-LD block below is that marking: `schema.org/CreativeWork` naming the model as its
 *    `creator`, a `SoftwareApplication`, with the prompt version and the instant it was written.
 *    The API carries the same claim as `KitProvenance` on every kit it answers with, and the
 *    `kits` row carries it at rest in `model`, `prompt_version` and `key_class`, all `not null`.
 *
 * **The Art. 50(2) "assistive editing" carve-out is not available here and is not relied on.** It
 * covers a system that helps with standard editing and does not substantially alter the input; a
 * cover-letter generator writes new prose, which is the opposite.
 *
 * What is deliberately **not** done: nothing is prepended to what the Copy buttons put on the
 * clipboard. A marking that survives a paste into an employer's form is not required by the text of
 * Art. 50(2), and per the Commission's guidance is not expected for free-form text — and a
 * disclaimer silently pasted into somebody's application would be a real harm traded for a
 * requirement that does not exist.
 *
 * The visible half renders whether or not a kit has been written yet; the marking needs a kit, so
 * it appears with one.
 */
export function AiDisclosure({ provenance }: { provenance: KitProvenance | null }) {
  const t = useTranslations("Kit");

  return (
    <>
      <div className={styles.disclosure} role="note">
        <p className={styles.disclosureLabel}>{t("disclosure.label")}</p>
        <p className={styles.disclosureBody}>{t("disclosure.body")}</p>
      </div>
      {provenance ? <ProvenanceMarking provenance={provenance} /> : null}
    </>
  );
}

/**
 * The machine-readable half. Renders nothing a person sees.
 *
 * `JSON.stringify` of a value built here from typed fields, never interpolated text, so there is no
 * path by which page content reaches the script element unescaped.
 */
function ProvenanceMarking({ provenance }: { provenance: KitProvenance }) {
  const marking = {
    "@context": "https://schema.org",
    "@type": "CreativeWork",
    abstract: "AI-generated application kit draft",
    creativeWorkStatus: "Draft",
    dateCreated: provenance.generatedAt,
    creator: {
      "@type": "SoftwareApplication",
      name: provenance.model,
      softwareVersion: provenance.promptVersion,
      applicationCategory: "GenerativeAI",
    },
  };

  return (
    // `dangerouslySetInnerHTML` is the only way to emit a JSON-LD body, and the `<` escape is what
    // makes it safe: nothing here is interpolated text, and a `</script` inside any field cannot
    // close the element.
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(marking).replace(/</g, "\\u003c") }}
    />
  );
}
