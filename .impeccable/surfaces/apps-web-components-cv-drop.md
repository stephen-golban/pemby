---
version: 1
slug: "apps-web-components-cv-drop"
primary_target: "apps/web/components/cv-drop/cv-drop.tsx"
related_targets:
  - "apps/web/components/profile/profile-field-list.tsx"
  - "apps/web/components/profile/teaser-card.tsx"
  - "apps/web/components/landing/drop-zone.tsx"
---

# Surface brief — the working CV drop (inside `/`)

Scope: what the landing page's drop zone becomes once a file is dropped and the CV drop is switched
on: reading, profile, teaser, save. Visitor mode: **Operate** (the visitor is in a task), living
inside the Persuade page whose brief is `apps-web-app-page-tsx.md`. Build path: **code-first**
(`.impeccable/config.json` records `code`; the owner chose it for app screens).

## Audience, job, action

The same sceptical visitor from the landing brief, now thirty seconds in: they dropped a CV with no
account and want to know whether this was worth it. The job: see that Pemby read their CV correctly,
and see whether any role can hire them from their country. Primary action afterwards: sign up to
save, before the 24-hour deletion.

The belief the panel must win: **Pemby read me correctly, and it is not padding the answer.**

## Direction contract

**THESIS.** The zone does not hand off to a new page or a modal; it grows in place into a working
panel and reports on itself out loud. The reading is a ledger being filled in, not a spinner: every
field keeps its row from the first second, holding a dashed "not yet" slot until the value arrives,
so the visitor watches their own CV being read rather than watching a progress bar.

**OWN-WORLD.** Landing tokens, Operate density. Flat warm surface, solid hairline rules instead of
dashed once the panel is live, no tilt, no nested card, no second shadow inside the panel. Grotesk
carries the state title, the name, the count and the role names; mono carries every row, label,
reason and footnote. The one colour is the green tier dot beside its words. Dark is a token swap.

**SIGNATURE INTERACTION.** The four-step ledger (Upload / Read / Profile / Roles): done steps take
the filled ticked mark DESIGN.md reserves for a criterion that is met, the step in progress is
outlined and breathes, steps not reached are dashed. Each step names its own state for a screen
reader; the live region announces every status change.

**MOTION.** State transitions only, and one calm arrival: a value that has just been read fades up
6px over `--duration-base` on `--ease-out`, once. `prefers-reduced-motion` removes it and the step
breathing. The landing's honest-silence settle stays the page's only orchestrated motion.

**HONESTY.** Zero is a real answer and is shown as one ("0 roles from Moldova right now"), never
padded with yellow-tier or near-miss jobs. Unsupported country and "your CV doesn't say where you
live" are stated plainly. Nothing claims Pemby gets anyone hired; the visitor opens the post
themselves.

## Decisions made in this round

1. **Optimistic, with a real rollback.** The file card, the step ledger and the reading state render
   on drop, before Turnstile, the anonymous session or the upload have answered. Any failure puts the
   previous state back (the idle zone, or the paste form with the text still in it) and names the
   reason from the route's own error code.
2. **Feature flag at request time.** `DropZoneSlot` is a server component behind `Suspense` whose
   fallback is the stand-in; the gate calls `connection()` then `cvDropEnabled()`. Cost: `/` is now
   server-rendered per request instead of prerendered. The Turnstile site key is passed as a prop,
   read through a variable so `next build` cannot inline it.
3. **The panel widens instead of moving.** 560px idle, up to 760px active, left-aligned inside the
   centred hero, so the visitor's eye stays where their file landed.
4. **Reusable pieces first.** `ProfileFieldList`, `ProfileChip`, `MatchCounter`, `TeaserCard` and
   `TeaserResults` live in `components/profile/` with no knowledge of the drop flow, for onboarding
   and the profile page (`renderAction` is the seam for inline editing).
5. **Deleting is quiet but present.** "Delete my CV now" sits under the teaser and in every error
   state; it is optimistic and clears the tab's stored id.

## Constraints

- PLAN D16 wording on every string; every string through `Cv.*` or `Landing.drop.*` in i18n.
- Personal data never travels with the request beyond the file itself: the upload is renamed to a
  generic name, only the local screen shows the visitor's file name.
- Green tier only in the teaser; reasons render from `reasonKey`/`reasonParams` through i18n.
- WCAG 2.2 AA: 44px targets, visible focus, focus moved to the panel heading on drop and back to the
  zone on rollback, a polite live region, unique ids (the zone renders twice per page).

## Unresolved

- The queued state (`status=queued`, the $3/day cap) is built and typed but was never seen on
  staging; it has not been screenshotted.
- The teaser's real count for the fictional junior CV is 0 on staging, so the three-job layout was
  verified with a fixture response, not real rows.
