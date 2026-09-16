# @pemby/ats

Reads the public job-board APIs of ATS vendors (Greenhouse, Lever, Ashby, Workable,
SmartRecruiters, Recruitee, Personio) and returns one shape, `NormalizedJob`. No database, no
queues: the worker calls it from pg-boss jobs and stores the result.

## Interface

```ts
const http = createAtsHttpClient(); // once per process
const connector = getConnector(ref.ats); // throws while the vendor is a placeholder
const jobs = await connector.listJobs(ref, { http, signal });
const full = job.detailComplete ? job : await connector.fetchJobDetail!(ref, job, { http, signal });
const hash = contentHash(full); // changed hash => re-enrich
```

- `BoardRef` is `{ ats, boardToken, region }`; `boardRefFromSource(entry)` builds it from a source
  list entry (no region means `us`).
- `listJobs` returns every open job on the board, all pages. `fetchJobDetail` exists only for
  vendors whose list omits descriptions; those jobs come back with `detailComplete: false`.
- Failures are `AtsError` with a `kind`. Only `board-not-found` says the board is gone. Every other
  kind (`rate-limited`, `http`, `network`, `timeout`, `parse`) is transient. Close jobs that
  disappeared only after a successful `listJobs`, never because of an error.
- Nothing here retries. The queue retries, honouring `retryAfterMs` on `rate-limited`.

## Adding a connector

1. Work only inside `src/<vendor>/`. Replace the placeholder in `src/<vendor>/index.ts` and keep
   the export name (`greenhouseConnector`, ...). `src/connectors.ts` already imports it.
2. Implement `AtsConnector`: `kind`, `rateLimits` (per host), `listJobs`, and `fetchJobDetail` if
   the list lacks descriptions.
3. Make every request through `ctx.http` with `{ ref, signal: ctx.signal }`. Set
   `boardRoot: true` on the board's listing URL so a 404/410 becomes `board-not-found`. If the
   vendor signals a missing board differently (200 with an error body), throw
   `new AtsError({ kind: "board-not-found", ... })` yourself. Requests follow redirects by default; pass
   `redirect: "manual"` to get a 3xx back as a response instead (Personio does this, because a
   dead board redirects to personio.com).
4. Validate responses with zod and throw `AtsError` `parse` on a mismatch. Map vendor fields in the
   vendor folder; use `htmlToText`, `decodeHtmlEntities`, `parseDate` and `workplaceTypeFromText`
   from `src/shared/`. `fast-xml-parser` is available for XML feeds.
5. `descriptionHtml` holds real HTML (decode escaped HTML first); `descriptionText` is
   `htmlToText(descriptionHtml)`, or `""` when unknown.

## Rate-limit etiquette

- Every request sends `User-Agent: PembyBot/0.1 (+https://pemby.app)`.
- The client limits each host (default 2 concurrent, 250 ms between request starts). A connector
  sets stricter limits in `rateLimits`; a key starting with `.` (`.jobs.personio.de`) shares one
  limiter across all subdomains.
- Use the cheapest endpoint: one list call with content included when the vendor offers it, over
  one detail call per job.
- Use one `createAtsHttpClient()` per process so limits hold across concurrent jobs.
