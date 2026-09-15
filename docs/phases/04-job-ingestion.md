# Phase 04: job ingestion and freshness

Read `docs/phases/_COMMON.md` first.

## Read first

- `docs/PLAN.md` sections 3 and 4
- `docs/research/03-competitors-and-automation.md` (ATS APIs and job data sourcing sections)
- `docs/research/04-business-and-gtm.md` (cold-start section; note Remotive's terms rule it out)
- `docs/research/12-juniors-and-internships.md` (local sources and their terms)
- `docs/phases/handoffs/01-handoff.md`

## Goal

The worker keeps a growing, deduplicated set of real tech jobs pulled from public ATS job boards, each
re-verified live at least every 12 hours, with source health visible. No AI in this phase.

## In scope

1. **Connectors** in `packages/ats` for Greenhouse, Lever, Ashby, Workable, SmartRecruiters, Recruitee
   and Personio public job-board endpoints. For each, confirm the current endpoint, fields, pagination
   and rate limits from official docs before coding. Normalize to one job shape: title, description
   (HTML and text), location strings, workplace type, department, employment type, salary fields when
   present, apply URL, updated time.
2. **Company discovery.** A seed list of companies and their board tokens that hire in PLAN D10 roles,
   with a bias toward companies known to hire remotely across regions. Build the first list from public,
   permitted sources (for example companies named in HN "Who is hiring" threads, remote-friendly company
   lists, and ATS board URLs found in Common Crawl if feasible). The list lives in private config
   (PLAN D23), not the public repo. Include a script to validate tokens and report dead boards.
3. **Role filter.** A cheap rules-based filter that keeps D10 roles and drops the rest before
   enrichment (titles and departments).
4. **Queues** with pg-boss: `ingest:<source>` per company on a schedule, `verify-live` every 12 hours per
   open job, closing jobs that disappear. Store `first_seen_at` and `last_verified_live_at`.
5. **Dedupe** the same job across boards and reposts (company + normalized title + location + similar text).
6. **Source health.** Per company: last success, error count, jobs found. Exposed as a JSON endpoint
   for the admin page in phase 09.
7. **Programs data file.** `data/programs/` with the programs from research 12 (GSoC, LFX, Outreachy,
   Canonical graduate roles and any confirmed local programs), each with eligibility, stipend, dates,
   source URL and last-checked date. A loader validates the file.

## Out of scope

Enrichment and eligibility (phase 05). Local boards without written permission (never scrape
delucru.md or staff.am; rabota.md and DOU only after they agree).

## Suggested work orders

- A (opus): Greenhouse, Lever, Ashby connectors plus the normalized job shape. Owns `packages/ats/src/{greenhouse,lever,ashby,shared}`.
- B (opus): Workable, SmartRecruiters, Recruitee, Personio connectors. Owns their folders in `packages/ats/src/`. Starts once A publishes the shared shape.
- C (opus): worker queues, scheduling, verify-live, dedupe, source health. Owns `apps/worker/src/ingest/`.
- D (opus): company seed list and validation script in private config; role filter. Owns the private source list and `packages/core/src/roles/`.
- E (sonnet): programs data file and loader. Owns `data/programs/`.

## Definition of done

- A staging run ingests from all seven ATS types. Report job counts per source and the total of D10-role jobs (evidence: a query output).
- Ingestion also runs in production behind the access gate, so the job backfill builds up early.
- verify-live closes a job that was removed (show one real or simulated case).
- Dedupe merges a known duplicate.
- typecheck, lint, build pass; worker runs on Railway staging without crashing for 24h (or as long as the phase allows; state which).
- Handoff lists coverage numbers and any ATS limits discovered.
