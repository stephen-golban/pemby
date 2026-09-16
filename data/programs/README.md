# Programs calendar

`programs.json` is the source of truth for the early-career programs calendar (PLAN D11):
mentorships, internships, graduate roles and fellowships genuinely open to candidates outside the
US/EU, with fixed application and cohort windows. Phase 07 reads it (via
`@pemby/core/programs`, `packages/core/src/programs/index.ts`) to suggest next steps to juniors
when the regular job feed has nothing to show them. Pemby is AI job-matching software; you apply
yourself, so this file only ever points people at a program's own application page.

## Editing

This file is edited by pull request, not by an admin UI. Before adding or changing an entry:

- Every entry needs at least one primary-source URL (`sourceUrls`) — the program's own page or
  API, not a secondary write-up — and a `lastChecked` date (the day you read that source).
- Transcribe only what the source states. Unknown fields are `null`, not a guess.
- Past windows are kept, not deleted; their dates just show they're in the past.
- **Nothing that charges candidates may be listed.** No application fees, deposits, "training
  fees" or paid certifications disguised as a program.
- Validate with `packages/core/src/programs/index.ts`'s `programsFileSchema` (typecheck plus a
  quick `loadPrograms()` run) before opening the PR — duplicate ids, bad dates, or an `opens` after
  `closes` will fail validation.
- Keep wording to "AI job-matching software; you apply yourself": never job board, recruiter,
  recruitment, placement, get hired, guaranteed job, auto-apply, or scrape.
