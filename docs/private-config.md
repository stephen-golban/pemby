# Private config

Pemby is a public AGPL-3.0 repo, but its prompts, scoring weights and job source lists are
not public (PLAN D23). They live in the private GitHub repo `stephen-golban/pemby-private`,
and every service loads them once at boot.

## How it works

1. A service calls `loadPrivateConfig()` from `@pemby/core/private-config` when it starts.
2. The loader resolves `PRIVATE_CONFIG_REF` to a commit sha with
   `GET https://api.github.com/repos/{repo}/commits/{ref}` (`Accept: application/vnd.github.sha`).
3. It downloads `GET /repos/{repo}/tarball/{sha}` (a 302 to codeload, followed automatically),
   gunzips and reads the tar in memory. Nothing is written to disk.
4. It keeps only layout files (below), validates each with zod, and caches the result for the
   life of the process. A failed load is not cached.
5. Any failure throws a `PrivateConfigError`, so the service crashes at boot instead of on the
   first job. Railway then shows the failed deploy.

Both requests send `Authorization: Bearer <token>` and `X-GitHub-Api-Version: 2026-03-10`.
Because the tarball is fetched by sha, the files and the recorded version always match.

When `PRIVATE_CONFIG_DIR` is set, the loader reads that directory instead and makes no
network calls. Local development and CI use this with `private-config.example/`.

Why this and not the other options from phase 01: a git submodule would need a deploy key in
Railway's build and would bake the config into the image, and Railway variables are awkward
for multi-line prompts and give no history. A boot-time fetch keeps the config versioned in git,
out of the build, and changeable by redeploying with a new ref.

## Environment variables

| Name | Secret | Meaning |
|---|---|---|
| `PRIVATE_CONFIG_REPO` | no | `owner/repo`, e.g. `stephen-golban/pemby-private` |
| `PRIVATE_CONFIG_REF` | no | Branch, tag or commit sha. Defaults to `main` outside production; required in production |
| `PRIVATE_CONFIG_TOKEN` | yes | Fine-grained GitHub token, read-only on that one repo |
| `PRIVATE_CONFIG_DIR` | no | Local directory. When set, the three above are ignored |
| `APP_ENV` | no | `development`, `staging` or `production`. Defaults to `development` only when neither `RAILWAY_ENVIRONMENT_NAME` nor `NODE_ENV=production` is set |

Rules the loader enforces:

- No `PRIVATE_CONFIG_DIR` and no `PRIVATE_CONFIG_REPO`: error in every environment.
- `PRIVATE_CONFIG_REPO` without `PRIVATE_CONFIG_TOKEN`: error, before any network call.
- `APP_ENV` unset while `RAILWAY_ENVIRONMENT_NAME` (set by Railway) or `NODE_ENV=production` is
  present: `invalid-env` error, instead of silently running as development.
- `APP_ENV=production` without `PRIVATE_CONFIG_REF`: error.
- A prompt the default AI routing needs (`REQUIRED_PROMPTS`: `job-enrichment`, `cv-parse`,
  `application-kit`) is missing: `invalid-layout` error naming the prompt.
- A config whose `manifest.json` has `"placeholder": true` (the example folder) is refused
  unless `APP_ENV=development`.

## File layout

```
manifest.json            { "schemaVersion": 1, "placeholder": false }
prompts/<name>.md        front-matter, then the prompt text
scoring/weights.json     score weights and thresholds
sources/<list>.json      job source lists, one file per list
```

Everything else in the repo (README, notes) is ignored. Names of prompts and source lists are
lowercase kebab-case. Each file must be UTF-8 and under 2 MB; the archive must be under 20 MB.

**Prompts.** Front-matter holds `version` (required, `[A-Za-z0-9._-]`, up to 64 chars) and an
optional `description`. Bump `version` whenever the text changes.

```
---
version: 2026-09-16.1
description: Extract seniority, stack, salary and eligibility from a job post
---
<prompt text>
```

Required prompt names: `job-enrichment`, `cv-parse`, `application-kit` (`REQUIRED_PROMPTS` in
`packages/core/src/private-config/schemas.ts`; `@pemby/ai` routing may only reference these).

**Scoring weights.** `components` has `embeddingSimilarity`, `skillOverlap`, `domain`,
`timezoneOverlap` and `companyFit`, each 0 to 1, summing to 1. `thresholds.match` and
`thresholds.nearMissMin` are integers 0 to 100 with `nearMissMin < match`.

**Source lists.** `{ "version": "...", "entries": [{ "ats", "boardToken", "companyName"?, "domain"?, "region"? }] }`
where `ats` is one of greenhouse, lever, ashby, workable, smartrecruiters, recruitee, personio.
`region` is `us` or `eu` and selects the vendor's API host for that board; leave it out for `us`.

The zod schemas are in `packages/core/src/private-config/schemas.ts`.

## Versions

`getPrivateConfigVersion()` returns `{ source, ref, id, shortId }`. For GitHub, `id` is the full
commit sha. For a directory it is `dir-` plus a sha256 of the loaded files.

`loadPrompt(name, version?)` returns the text and a `versionId` of the form
`<name>@<front-matter version>+<shortId>`, for example `job-enrichment@2026-09-16.1+3f9c2a1b7e40`.
Store `versionId` in `ai_usage` and `job_enrichment` rows. Passing `version` makes the call throw
if the loaded prompt has a different version.

## Pinning a ref

- **Staging** may follow `main` (the default) so prompt changes show up on the next deploy.
- **Production** must set `PRIVATE_CONFIG_REF`. Use a tag (`git tag config-2026-09-16 && git push
  --tags` in the private repo) or a full commit sha. Promote by changing the Railway variable on
  `web`, `worker` and `bot`, which redeploys them.
- Config is read only at boot. Pushing to the private repo changes nothing until services restart.

## The token

Create a fine-grained personal access token at GitHub, Settings, Developer settings, Fine-grained
tokens:

- Resource owner: `stephen-golban`. Repository access: only `pemby-private`.
- Repository permissions: **Contents: Read-only** (Metadata: Read-only is added automatically).
  GitHub's permission table lists Contents read for both endpoints the loader calls.
- Expiration: 90 days or less. Set a reminder before it expires.

Store it only as the Railway variable `PRIVATE_CONFIG_TOKEN` (shared across the services that need
it, per environment). Never put it in a `.env` file in the repo, CI logs or chat.

**Rotation.**

1. Create the new token with the same settings.
2. Update `PRIVATE_CONFIG_TOKEN` in Railway for staging, confirm the services boot, then production.
3. Revoke the old token in GitHub.

If the token leaks, revoke it first, then do steps 1 and 2. Services already running keep their
cached config; only restarts need the new token.

## Local development

```sh
PRIVATE_CONFIG_DIR=./private-config.example pnpm --filter @pemby/core check:private-config
```

A relative `PRIVATE_CONFIG_DIR` is looked up from the current directory, then each parent, so the
same value works from the repo root and from a package directory. To work on real prompts, clone the
private repo next to this one and point `PRIVATE_CONFIG_DIR` at it; keep `APP_ENV=development`.

The check script prints only the source, version id, prompt names with versions, and source list
names with entry counts. It never prints file contents.

## Logging

The loader never logs. Its error messages contain env var names, repo, ref, HTTP status and file
paths only: no token, no file contents (JSON parse messages are dropped because they can quote the
file). Code that uses a prompt must not log the prompt text either.

## Known risks for later phases

- The AI SDK's `APICallError` carries `requestBodyValues` and `responseBody`. For `cv-parse`,
  `profile-embedding` and `application-kit` those hold CV and profile text. Scrub them (keep only
  status, model and task) before any logging or Sentry capture, including Sentry's automatic
  error integration.

## Never in the public repo

- Real prompts, including drafts and "just for testing" copies
- Scoring weights or thresholds used in staging or production
- Job source lists (company names, ATS board tokens)
- `PRIVATE_CONFIG_TOKEN`, OpenRouter keys or any other secret

`private-config.example/` is public and must stay obviously fake: PLACEHOLDER prompts, equal
weights, empty lists, `"placeholder": true`.
