---
version: 1
slug: "apps-web-app-onboarding-page-tsx"
primary_target: "apps/web/app/onboarding/page.tsx"
related_targets: ["apps/web/app/profile/page.tsx","apps/web/app/api/profile/route.ts"]
---

# Surface brief — onboarding (`/onboarding`) and the profile page (`/profile`)

Scope: the two Operate screens where the CV-parsed profile becomes a matching profile and stays
editable afterwards. Visitor mode: **Operate**. Build path: **code-first** (`.impeccable/config.json`
records `code`). These screens inherit the world of `apps-web-app-page-tsx.md` and continue the
working-panel grammar of `apps-web-components-cv-drop.md`.

## Audience, job, action

The same person, one step further on: their CV has been read and they have just verified an email
(or they are still anonymous and their data expires in 24 hours). They are not exploring; they are
finishing a setup they expect to take about a minute.

- `/onboarding` task: confirm three topics of pre-filled answers — eligibility, ways of working,
  role and money — and see what each answer does to the number of roles that can hire them.
- `/profile` task: change any of it later, see how complete the profile is, take their data out,
  or delete the account.

The belief both screens must win: **every answer here is load-bearing, and Pemby will not pad the
result.**

## Direction contract

**THESIS.** Onboarding is not a wizard. It is the same hairline ledger the CV drop filled in, now
editable, standing next to a live count that is the visible consequence of every answer. One topic
per screen, every row already answered, one action to accept the lot. It refuses the category
default — a multi-page form with a progress bar over a stack of labelled inputs and Next/Back at the
bottom — and refuses its predictable opposite, the chatty one-question-per-screen conversational
flow, which would turn a one-minute confirmation into twelve screens.

**OWN-WORLD.** Landing tokens at Operate density, no new ones. Warm ground, hairline-ruled rows, no
boxes around cells, no tilt, no nested cards, no shadow inside a panel. Grotesk carries the step
title, the count, the strength percentage and the primary button; mono carries every label, value,
option, explanation and footnote. Uppercase mono labels in a fixed 9rem column, exactly as
`components/profile/profile.module.css` sets them, so a row on `/onboarding` and a row on the CV
panel are visibly the same object. One accent only: the green tier swatch beside its words. The
`paper-card` outline is reserved for the two neutral blocks that are not ledger rows — "Save your
work" and "Delete account". Dark is a token swap.

**STORY.** The visitor sees their own answers already filled in, corrects the two that are wrong,
watches the count move, and reaches a Brief-ready profile without typing a form. On `/profile` they
see one number for how complete it is, what is still missing and where each missing thing lives, and
two plain exits: take the data, or delete the account.

**FIRST VIEWPORT.** Shared top bar. Below it, a centred column of at most 1100px split 7fr/5fr.
Left: the step title in grotesk at 34px, one mono sub-line, then the topic as a ledger — uppercase
mono label, the current value as mono text or chips, and an outline "Edit" pill in a third column
that opens the editor **in the row**, never in a modal. Under the ledger, one ink pill ("Looks
right") and, on steps 2 and 3, a quiet text link to skip. Right, sticky from 1000px up and, below
that, above the ledger and scrolling with it: the count rail — the ink count badge and its grotesk line ("12 roles hire
from Moldova"), a mono footnote naming the green tier, then the three steps as a small ledger with
filled / outlined / dashed marks. On `/profile` the rail carries the strength meter instead: a
grotesk percentage over a 8px hairline-track bar, and the missing fields as outline pills that move
focus to their row.

**SIGNATURE INTERACTION.** The count rail. Every edit recomputes it through the same teaser
interface the landing uses, green tier only, debounced. While a new number is being worked out the
badge keeps the last number and goes quiet (dimmed, dashed border) rather than flashing a wrong
one; a count that has never been known shows the dashed empty badge. It is allowed to go down and
allowed to be zero, and zero is written out in words.

**MOTION.** State transitions at `--duration-fast`, and one authored moment: when the count settles
on a new number the badge cross-fades and its border draws once over `--duration-base` on
`--ease-out`. No entrance choreography — this screen loads into a task. `prefers-reduced-motion`
removes the cross-fade and the draw.

**FORM.** Ledger-plus-consequence, first on an ordered list of five structures considered (ledger +
live count; card-per-topic grid; single scrolling form with a sticky summary; conversational
one-question-per-screen; diff view "what we read / what you say"). No `concept-seed` roll was run
and there is no seed key: the request is precisely specified down to the field list, the step
split, the counter, the meter, the export and the deletion, which `new-work.md` §3 routes to shaping
directly rather than to a surface concept tournament. The build is code-led, so the ambition lives in
the FIRST VIEWPORT block and the count rail above.

**FINISH.** unreviewed and undocumented is unfinished; this build ends with the finish review, the
verdict, DESIGN.md, and every shipping raster carrying its provenance.

## Decisions made in this round

1. **Editing happens in the row.** Every editor (country select, chip list, radio group, checkbox
   group, number field) replaces its own value cell and returns focus to the Edit pill on close. No
   modal, no drawer, no separate edit page.
2. **Every edit saves immediately and optimistically.** `PATCH /api/profile` through
   `optimisticUpdate(["profile"])`; the row shows the new value at once, rolls back to the previous
   value on failure and says why. There is no Save button anywhere on `/profile`.
3. **Step 1 blocks only on residence country.** It is the field the eligibility gate runs on; with
   it empty the count cannot exist. Every other step-1 field has an honest empty meaning (no
   citizenship listed, no permits, no own company) and can be confirmed empty.
4. **Strength is derived, never stored.** `profileStrength()` is a pure function shared by the
   server view type and the client, so the meter moves with the optimistic value in the same frame
   as the row.
5. **Deletion is typed, in-page, and quiet.** A `paper-card` block lists exactly what is deleted,
   takes the literal confirmation phrase in a text field, and keeps its button unavailable until the
   phrase matches. No red, no modal, no alarm iconography: the tier colours belong to eligibility.
6. **Anonymous visitors may finish the whole flow.** The save-your-work block stays visible on both
   screens with the 24-hour deletion stated, reusing `Cv.save.*`.
7. **The CV fallback stops at `onboarding_completed_at`.** Until onboarding is finished, an empty
   column falls back to the parsed CV (and `defaultWaysFor`), so the steps arrive pre-filled. After
   it, the row is the whole truth: without that switch, clearing every way of working or every
   title would silently come back on the next read and nobody could ever narrow what they see.

## Constraints

- PLAN D16 wording on every string; every string through the `Onboarding` namespace or reused
  `Cv.*` keys. No promise that Pemby will message anyone — delivery does not exist until phase 08.
- Enum values: DB spelling in the database, core spelling in TypeScript, converted with the core
  mappers on the server only. Client components keep local copies of the value lists so `@pemby/core`
  (zod, the eligibility engine) stays out of the browser bundle.
- API: session required (401), stable error codes with no user-facing strings, `Cache-Control:
  no-store`, hand-validated input in the style of `lib/teaser/query.ts` (zod is not a web dependency).
- The teaser is green tier only and never yellow, for anonymous and free users alike.
- WCAG 2.2 AA: 44px targets, visible 2px focus ring, every editor reachable and labelled, a polite
  live region for the count, and the count never conveyed by position alone.

## Unresolved

- Turning **every** way of working off *during* onboarding snaps back to `defaultWaysFor` on the
  next read, because the profile is not settled yet. The fix is a per-field "answered" marker, or
  moving the step-2 default into the client seed.
- `GET /api/teaser` cannot express an **empty** list: `parseTeaserQuery` rejects an empty value and
  `teaserInputFromProfile` then falls back to the CV's titles. So a settled profile with no titles
  is counted as if it still had the CV's titles. Owner: the teaser order (E).
- `/onboarding` and `/profile` are product routes, so with `OWNER_GATE=on` the proxy sends an
  anonymous visitor to `/sign-in` before the page runs. The anonymous path is therefore only
  reachable with the gate off (staging default). `lib/access/paths.ts` belongs to another order.
- The strength weights are a first cut chosen from which columns the phase-06 teaser gates actually
  read; phase 07's matcher should revisit them against the real score.
- Export deliberately carries the parsed profile and CV metadata but not the extracted CV text, per
  the work order. If the owner wants GDPR-portability completeness, the raw text belongs in it too.
