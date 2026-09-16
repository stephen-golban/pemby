# Phase 04 handoff: job ingestion and freshness

Staging part done 2026-09-16. Production ingestion and the full 24h stability window are still
pending (see "Definition of done").

## What shipped (all on main, CI green)

| Commit | Unit |
|---|---|
| `1bd0d79` | Role filter (`packages/core/src/roles`) and programs calendar (`data/programs`, `@pemby/core/programs`) |
| `7609da6` | `@pemby/ats` (seven connectors, HTTP client), research 15, schema migrations 0002 + 0003, pg-boss worker, source-list `region` field |
| `742ad0d` | `validate:boards` script |
| `a975c9e` | Company sync at boot runs in the booting process (deploy-overlap bug, below) |
| `d339d52` | Empty commit to re-send a lost push event |

Private config `stephen-golban/pemby-private`: commit `86830f0`, tag `config-v0.2.0`, with
`sources/ats-boards.json` (300 boards). Staging reads that repo's `main`.

A blind adversarial review of the worker, schema and HTTP client found 13 issues (6 major: wrong
closures on partial config, not-found strikes with no time span, the empty-read guard ignoring the
role filter, reopening over quarantined jobs, stale canonicals, jobs of unread boards never
closing). All are fixed in `7609da6`.

## Definition of done

| Item | Status |
|---|---|
| Staging ingests from all seven ATS types | 6 of 7. SmartRecruiters is built but disabled (`INGEST_DISABLED_ATS=smartrecruiters`) until it grants written permission: `api.smartrecruiters.com/robots.txt` allows only LinkedInBot. Permission email drafted for the owner. |
| Counts per source, total D10 jobs (2026-09-16 21:12 UTC, open, non-demo) | greenhouse 4,076 · ashby 1,013 · lever 1,000 · workable 735 · recruitee 366 · personio 202 · **total 7,392**; 80 merged duplicates; 303 boards, all `active` |
| Ingestion in production behind the gate | **Pending.** Production did not exist on main when this phase ran. Needs owner approval. |
| verify-live closes a removed job | Shown on staging: simulated job `pemby-sim-removed-1` on amdaris closed on the next read (row deleted after). |
| Dedupe merges a known duplicate | Shown with a simulated copy of a ramp job; 80 real merges since (67 on Greenhouse). |
| typecheck, lint, build pass | Yes, re-run by the lead on each commit. |
| Worker on staging 24h without crashing | **Partial:** pg-boss worker up since 17:19 UTC, 300-board list since 18:55 UTC, current deployment `8be36ba7` since 20:50 UTC, no crash or restart, peak memory 507 MB. Re-check before closing the phase. |

## Deviations from the phase file, and why

1. **SmartRecruiters off** (owner decision, above). The connector has a detail call per posting because its list has no description.
2. **Queue names** are `ingest.<ats>`, not `ingest:<ats>`: pg-boss allows only letters, digits, `_ - . /`.
3. **verify-live re-reads whole boards**, not single jobs: one list call confirms every job on a board. An hourly sweep enqueues any board with an open job not verified for 10h; a 6-hourly schedule reads every board.
4. **Only role-filtered jobs are stored.** Dropped jobs are counted in `company_source_health.jobs_listed`.
5. **Source health is a query**, `getSourceHealth()` in `@pemby/db`. The owner-gated JSON route (`/api/admin/source-health`) is a small order for after phase 03 (apps/web was phase 03's).
6. **Company discovery** used HN "Who is hiring" (HN and Algolia APIs), the Common Crawl URL index, and the remoteintech list (ISC/MIT). Talent marketplaces and job sites (Turing, Andela, Remotebase, JobLeads) were dropped by the owner.
7. **The first real run used the staging database directly** (owner decision; no local Postgres).

## New env vars and services

- Worker: `DATABASE_URL` (required now), `INGEST_INTERVAL_HOURS` (6), `VERIFY_LIVE_MAX_AGE_HOURS` (10, max 10), `INGEST_CONCURRENCY` (2; greenhouse/lever/ashby always 1), `INGEST_DISABLED_ATS`, `INGEST_SOURCE_LISTS` (`ats-boards`). Names in `.env.example`.
- Set on staging worker: `INGEST_DISABLED_ATS=smartrecruiters`.
- Database: schema `pgboss` (created by pg-boss), table `company_source_health`, enum `board_status`, new columns on `companies` and `jobs` (migrations 0002, 0003; additive).
- Dependencies: `pg-boss` 12.32.0, `html-to-text` 10.0.1, `entities` 8.1.0, `fast-xml-parser` 5.11.1.

## UNVERIFIED items resolved (details: `docs/research/15-ats-public-endpoints.md`)

- Greenhouse has no EU API host; EU boards read through `boards-api.greenhouse.io`. HTML arrives entity-escaped.
- Lever EU is `api.eu.lever.co`; robots.txt asks `Crawl-delay: 1`; a site with no postings returns `200 []`.
- Workable's documented host redirects; read `apply.workable.com/api/v1/widget/accounts/{token}?details=true`.
- SmartRecruiters list lacks descriptions and URLs; an unknown company returns `200` with an empty list.
- Personio: never send `?language=`; an unknown company answers 307 to personio.com (treated as not found).
- Only Greenhouse and Recruitee expose an updated time; change detection uses a content hash.

## ATS limits discovered

- **Recruitee requires a per-employer token (`X-Careers-Sites-Token`) from 10 Feb 2027**; keyless reads return 401 after that. 25 boards depend on it. Revisit in January 2027.
- Workable returned 429 to a laptop IP after about 1,300 discovery requests (no Retry-After). From Railway it works.
- No vendor documents read limits except SmartRecruiters (10 req/s, 8 concurrent). Payloads are large: OpenAI's Ashby board is 14 MB, Lever palantir took up to 23 s. Responses over 32 MB are refused.

## Known issues

- **Deploy overlap:** Railway runs old and new containers side by side, so any queued job can land on the old one. Boot sync is now inline; keep other boot-time work out of the queue.
- A board's first read makes about two queries per job inside one transaction (GitLab: 99 s over the public DB URL). Fine on the private network so far; batch if boards grow.
- Dedupe advisory locks are not taken in a fixed order; two boards can deadlock, and Postgres aborts one (the queue retries).
- SmartRecruiters offset pagination can skip a posting removed mid-read (only matters once enabled).
- The private config is read once at boot: a list change reaches the worker only after a redeploy.
- A push whose git client reports errors may land without firing CI or Railway (seen once). An empty commit fires CI but Railway skips it (no watched files changed); use `railway redeploy --from-source` for the worker.

## Notes for phase 05 and production

- Enrich only `jobs` with `status = 'open'` and `is_demo = false`; `role_family`, `locations`, `workplace_type`, `department`, `employment_type`, `salary_*` and `description_html` are already normalized. Re-enrich when `content_hash` changes.
- Merged jobs point at their canonical through `duplicate_of_job_id`; enrich canonicals only.
- Production: mirror the staging worker variables, pin `PRIVATE_CONFIG_REF=config-v0.2.0`, set `INGEST_DISABLED_ATS=smartrecruiters`, then deploy. Migrations run from the web pre-deploy step.
- Scripts: `pnpm --filter @pemby/worker ingest:once -- <ats> <token> [us|eu]`, `health`, `validate:boards -- --file <list.json>`.
- remote.com as a partnership ask (02 handoff) was not acted on; it is the owner's call.
