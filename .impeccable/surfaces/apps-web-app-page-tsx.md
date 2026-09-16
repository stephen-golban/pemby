---
version: 1
slug: "apps-web-app-page-tsx"
primary_target: "apps/web/app/page.tsx"
related_targets: []
---

# Surface brief — landing page (`/`)

Scope: the public landing page at `pemby.app/`. Visitor mode: **Persuade**.
Build path: comp-led. Approved comp: `.impeccable/mocks/band-light.png` (light is the contract).
Theme twin: `.impeccable/mocks/band-dark.png`. Both ship; neither is optional.

## Audience, job, action

Tech people (intern to principal) in countries that "remote" jobs quietly exclude — Moldova first,
then Ukraine, Georgia, Armenia, the Balkans, LATAM, Africa, South Asia. They arrive sceptical, having
been burned by postings that turned out to be US-only or already filled. The frame is the job, not the
place: "jobs that can actually hire you" leads, and the country list is proof underneath it.

The single belief the first viewport must win: **this will not waste my time.** Eligibility and
live-verification are the proof under that belief, not the headline.

Primary action: drop a CV. Anonymous, no signup, deleted in 24h if unclaimed.

## Direction contract

**THESIS.** Matches arrive as a small set of physical, coloured cards, each carrying the reason it can
hire you — the page shows the product's output rather than describing it. It refuses the category
default: a search bar over an endless results feed, and its predictable opposite, a screenshot-of-the-
dashboard hero with three feature columns. Pemby has no feed to show, so the page shows the few things
it would actually send you.

**OWN-WORLD.** A clean, flat, untextured warm off-white ground (#faf6f0) with warm near-black ink
(#14110d) — never pure white, never pure black, and never a paper, newsprint or printed-document
texture. A friendly bold grotesk with generous x-height and slightly rounded terminals carries the
headline, role names and buttons, set large, tight and negatively tracked, always sentence case.
Monospace carries every paragraph, criterion row, tag and footnote; small labels are uppercase with
wide letter-spacing. One deep olive field (#2b3323) anchors the lower page. Cards take muted earthy
fills — plum #8d6076, ochre #d6a24a, ink-blue #2c4a5e — with very large soft radii, deep diffuse
shadows, a slight playful tilt, and candid editorial photography of people working, colour-graded into
each card's own colour. Small loose hand-drawn marks appear sparingly. The dark theme is a token swap
on the identical design: warm charcoal ground #191510 (warm brown-black, never blue-black), cream type
#f7f1e6, deepened olive field #1e2419 and deepened card fills.

**STORY.** The visitor understands in one line that Pemby sends only jobs that can legally hire them
where they live. They believe it because the cards show real reasons — "hires from Moldova", a
timezone overlap, the way of working — and because one card says "Nothing today" instead of
manufacturing results. They drop their CV without making an account.

**FIRST VIEWPORT.** Top bar: brandmark and wordmark left; "How it works", "Pricing", "About",
"Telegram" right; light/dark toggle at the far right. Then a large run of empty ground. The headline
sits centred, two lines, at roughly 82px, line-height ~0.95, sentence case: "Jobs that can actually
hire you." The monospace sub-line sits beneath it, constrained to ~640px so it wraps to two lines and
never stretches across the viewport. Beneath that, the primary action: a CV drop zone ~560px wide,
soft rounded surface, dashed outline at ~25% opacity, holding an upload glyph, "Drop your CV", and
"No account. Anonymous. Deleted in 24 hours." Then a generous gap before a full-bleed deep olive field
with a large radius on its top corners, carrying four slightly tilted cards whose tops overlap the
field's upper edge: Platform Engineer (plum), Senior Backend Engineer (ochre), Data Engineer
(ink-blue), and an outlined honest-silence card reading "Nothing today / 6 near misses, grouped by what
blocked them" with a small sleeping-face doodle.

**FORM.** The Band — cards standing on a deep colour field — chosen by the owner from a
desertant-anchored hand after the dice-assigned hand was rejected for ignoring the pinned brand
reference. It is a brief-pinned direction, not the roll's assignment; the roll's seed key was
**83429242** (scope: direction, mode: persuade). desertant.com is a binding brand reference per PLAN
D25: the family resemblance is deliberate, the specific signatures are not. Explicitly refused as
theirs: the grain-stippled hero words, the full-bleed horizontal product carousel, the tag pill in a
card's top-right corner, and their exact cream.

**FINISH.** unreviewed and undocumented is unfinished; this build ends with the finish review, the
verdict, DESIGN.md, and every shipping raster carrying its provenance.

## Binding build corrections

These were found in the approved comp and are corrected in code, not by regenerating the comp:

1. **Vertical rhythm — the owner's explicit instruction.** The approved comp is too vertically
   compact. The build opens it up throughout the hero and between every section: ~40px clearance above
   the top bar, then ~150px of empty ground before the headline, ~56px headline to sub-line, ~80px
   sub-line to CV drop zone, ~130px from the drop zone to the colour field. At least a third of the
   first viewport stays empty ground. `.impeccable/mocks/band-light-v2.png` and `band-dark-v2.png` are
   spacing references only — they are not the contract and their logo, photography and card crops do
   not bind.
2. **Criterion rows must read as satisfied.** In the comp they render as empty unchecked boxes beside
   "hires from Moldova" and the timezone row, which states the opposite of what they mean. Ship them as
   filled ticked squares.
3. **The twins must not drift.** Light and dark carry identical copy, identical card content, identical
   spacing and the same brandmark. Only surface colours change between them.
4. **Label the synthetic content unmissably.** Every company, role, reason and timestamp on the cards is
   invented. The `EXAMPLE` marker in the comp is a small corner footnote; the build makes it plainly
   visible, and it must appear in both themes.
5. **Contrast.** The dark theme's sub-line and drop-zone caption sit low against the ground. Everything
   body-critical clears WCAG 2.2 AA in both themes.
6. **The olive field must read as a surface**, visible above, between and around the cards, not as a
   thin strip behind them.
7. **Rotation is a landing-page flourish only.** Tilted cards never enter the app; per research 05 they
   hurt scanability and keyboard use in dense lists.

## Constraints

- Wording rules (PLAN D16) bind every string: Pemby is "AI job-matching software; you apply yourself".
  Never "job board", recruiter, recruitment, placement, get hired, guaranteed job, auto-apply, scrape,
  beat the ATS, "we write your CV". The comp's own sub-line already complies: "Pemby watches companies'
  own careers pages…"
- Nothing may be invented beyond labelled demonstration content: no user counts, job counts, company
  logos, testimonials, ratings or press. None exist.
- Every user-facing string goes through the i18n layer from phase 01. English at launch.
- Both themes ship, honouring `prefers-color-scheme`, with a visible toggle.
- Optimistic UI applies to any mutation on this surface (the CV drop).

## Memorable moment

The honest-silence card. A landing page that shows "Nothing today" beside three real matches is making
a promise no competitor makes, and it is the one card a visitor will describe to someone else.

## Unresolved

- Brandmark: undecided. Every comp invented a different one; phase 03 needs a real mark or a wordmark-
  only lockup.
- Card photography: the approved comp uses candid working photography. Research 05 warns that
  stock-editorial portraiture on a job product risks reading as fake success imagery. The owner accepted
  the desertant-style photographic card; sourcing and licensing for real imagery is a phase 03 decision.
- Pricing, Terms, Privacy and Refund pages are linked from this surface but built in phase 03.
