# Phase 02 handoff — product context and landing direction

Completed 2026-09-16. Owner approved the direction, the comp and the commit.

## Status of earlier phases

**Phases 00 and 01 have NOT run.** Phase 02 ran first because it needs no accounts and no code. The
owner could not create accounts on the day. Consequences carried forward:

- There is no monorepo, no `apps/web`, no database, no Railway environment, no staging site.
- There is no `docs/PROGRESS.md` and no progress-page artifact. Phase 02's definition of done asks for
  the approved comp to appear on the progress page; that step is **deferred to phase 01**, which owns
  the artifact. Nothing was invented in its place.
- No deploy steps from `_COMMON.md` applied.

## What shipped

| Artifact | Path |
|---|---|
| Product record | `PRODUCT.md` (176 lines, carries the `impeccable:product-schema 1` comment) |
| Build-path config | `.impeccable/config.json` — `"buildPath": "comp"` |
| Approved comp | `.impeccable/mocks/band-light.png` + `.impeccable/mocks/band-light.json` (`"approved": true`) |
| Dark theme twin | `.impeccable/mocks/band-dark.png` + `.impeccable/mocks/band-dark.json` (`"approved": false`) |
| Surface brief | `.impeccable/surfaces/apps-web-app-page-tsx.md` (124 lines) |
| Spent comp rounds | `.impeccable/mocks/decision/` (5 files), `.impeccable/mocks/fan-*.png` (3), `deck-*.png` (2), `band-*-v2.png` (2) |

Every PNG carries its exact generation prompt embedded in a PNG `tEXt` chunk; verified by reading it
back with `impeccable embed-prompt --read`, not by trusting the producer's report.

## Direction

**The Band** — match cards standing on a deep olive field, on a flat warm off-white ground (dark twin
on warm brown-black). Persuade mode. Direction contract, six blocks plus seed key `83429242`, lives in
the surface brief.

The direction is **brief-pinned, not the roll's assignment**, and the brief says so. The dice assigned
a tournament-pairing-bulletin world (candidate 5 of seven grounded directions); the owner rejected that
entire hand for ignoring desertant.com, which PLAN D25 makes a binding brand reference.

## Deviations from the plan, and why

1. **Four direction/comp rounds instead of one.** Round 1 (dice-assigned document worlds) was rejected
   for ignoring the pinned reference. Round 2 anchored comps on desertant screenshots and produced a
   near-clone. Round 3 over-corrected into sterile "evidence sheet" pages. Round 4 landed. Root causes,
   recorded so the next phase does not repeat them: passing the reference screenshot buys fidelity and
   costs identity, and the word "paper" in a prompt reliably drags the render toward newsprint,
   documents and stamps. Specify the ground as "flat, smooth, untextured".
2. **The approved comp is the original Band, not the re-spaced `-v2` render.** The owner asked for more
   vertical breathing space. Codex cannot adjust an existing image — every run regenerates from scratch
   and changes the logo, photography and crops — so regenerating to fix spacing was the wrong tool.
   Spacing is now a **binding build instruction in the direction contract**, with named pixel gaps. The
   `band-*-v2.png` files remain on disk **as spacing references only**; they are not the contract and
   their logo, photography and card crops do not bind.
3. **`build-phase start` was not run.** The script's `start` requires `--comp`, and the comp round is
   complete, so phase 03 should begin with
   `impeccable build-phase start --comp .impeccable/mocks/band-light.png`.
4. **The decision page was abandoned as the answer channel.** `serve-question` served four rounds;
   every one closed unanswered (`WAIT_EXIT=4`). Decisions were taken through the structured question
   tool and in conversation instead. Phase 03 should not assume that page works on this machine.
5. **No adversarial reviewer was called.** This phase produced no code, no auth, no payments and no
   migrations — only markdown, JSON and images. A blind second reviewer had nothing to review.

## Binding corrections recorded in the brief (do not re-derive)

The approved comp contains defects that are fixed **in code**, not by regenerating the image:

1. Vertical rhythm — the owner's explicit instruction, with named gaps (~150px before the headline,
   ~56/80/130px thereafter, a third of the first viewport left empty).
2. Criterion rows render as empty unchecked boxes but mean *satisfied* — ship them ticked.
3. The light and dark twins drifted in card copy in earlier renders — they must be identical but for
   surface colour.
4. `EXAMPLE` labelling is a small corner footnote; all card content is invented and must be labelled
   unmissably, in both themes.
5. Dark-theme sub-line and drop-zone caption need a WCAG 2.2 AA contrast pass.
6. The olive field must read as a surface, not a strip behind the cards.
7. Card rotation is a landing-only flourish; it never enters the app (research 05).

## Decisions taken with the owner

- Landing frame: **the job, not the place** — "jobs that can actually hire you" leads; the country list
  is proof underneath. Country-neutral, not Moldova-first.
- The belief the first viewport must win: **it won't waste my time.**
- Founder story may name **Stephen Golban**, a Moldovan engineer with **7 years**, **underpaid by
  middlemen**, operating through **Syncra Studio**. No figures or employers beyond that.
- Accessibility bar: **WCAG 2.2 AA**, recorded in PRODUCT.md.
- Both light and dark themes ship, honouring `prefers-color-scheme`, with a visible toggle.

## New env vars and services

None. Phase 02 added no dependency, no service and no secret.

## UNVERIFIED items

None resolved and none newly opened by this phase. The research items PLAN section 10 lists remain open
for the phases that depend on them.

## Known issues / open decisions for phase 03

- **Brandmark is undecided.** Every comp invented a different mark. Phase 03 needs a real mark or a
  wordmark-only lockup.
- **Card photography.** The approved comp uses candid working photography. Research 05 warns that
  stock-editorial portraiture on a job product can read as fake success imagery; the owner accepted the
  photographic card anyway. Sourcing and licensing is a phase 03 decision, and every shipped raster
  needs provenance.
- **Surface brief target does not exist yet.** The brief is keyed to `apps/web/app/page.tsx`, which
  phase 01 creates. The write succeeded regardless.
- Pricing, Terms, Privacy and Refund pages are linked from the landing page and built in phase 03.

## Note recorded for phase 04, not acted on

The owner asked about remote.com, instahyre.com and hirify.me as job sources. Researched against
primary sources on 2026-09-16; two claims spot-checked independently. All three ToS forbid building a
competing aggregator from their listings. Instahyre is India-domestic and lacks eligibility, date and
contract-type fields. Hirify's Agent API is metered per person and cannot back a multi-user product.
Only remote.com is worth a phase-04 work order, and as a **partnership ask, not a scraper** — roughly
70% of its apply links already resolve to ATS boards Pemby ingests directly. **Not added to PLAN.md**;
that is the owner's call.

## Next

Phase 03 (`docs/phases/03-landing-legal-pricing.md`) builds this landing page, but it depends on the
monorepo. Run **phase 00 and 01 first** unless the owner opts for the local-only variant of phase 01.
Start phase 03 with `impeccable build-phase start --comp .impeccable/mocks/band-light.png`, read the
surface brief before writing any code, and treat the seven corrections above as part of the contract.
