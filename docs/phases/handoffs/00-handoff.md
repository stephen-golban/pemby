# Phase 00 handoff: founder setup

Run 2026-09-16, after phase 02. Partial completion, which the phase allows. Full record: `docs/SETUP.md`.

## What shipped

- Accounts and keys: GitHub repo, Railway project with `production` and `staging`, Cloudflare DNS,
  Turnstile, Email Routing, OpenRouter with a ZDR guardrail on the private key, two Telegram bots,
  the `@pemby_jobs` channel, and Resend. See the SETUP.md table.
- Railway shared variables (names only): `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`,
  `OPENROUTER_KEY_PUBLIC`, `OPENROUTER_KEY_PRIVATE`, `OWNER_TELEGRAM_CHAT_ID` in both environments;
  `TELEGRAM_BOT_TOKEN` and `RESEND_API_KEY` with a different value per environment;
  `TELEGRAM_PUBLIC_CHANNEL` in production only.
- Git history before the first public push: the 15 desertant.com screenshots in
  `docs/research/desertant/` were removed from every commit (owner decision). They stay on disk and
  are gitignored. Commit hashes changed: `04603e3` became `26fae36`, `071dc5a` became `a18868d`.

## Evidence

- `dig NS pemby.app` returns `zac.ns.cloudflare.com`, `izabella.ns.cloudflare.com`.
- `dig MX pemby.app` returns `route1/2/3.mx.cloudflare.net`; the TXT record is
  `v=spf1 include:_spf.mx.cloudflare.net ~all`. The owner received a test mail at hello@pemby.app.
- The Resend DKIM record `resend._domainkey`, the `send.pemby.app` records and `_dmarc` all resolve.
- The OpenRouter guardrail was proven with live calls; see the SETUP.md notes.
- Telegram: both bots answer `getMe`; `getChatMember` shows the production bot as an administrator of
  `@pemby_jobs`.

## Deviations and owner decisions

1. **OAuth apps (GitHub, Google), Sentry and PostHog are deferred** until the owner has tried the
   product. Phase 01 ships **email and password** auth (Better Auth credentials) plus anonymous
   sessions, and no observability. Magic link is also deferred; Resend is ready when it returns.
   Phase 01's definition of done must be read with this change: no GitHub, Google or magic-link sign-in.
2. **One public Telegram channel**, `@pemby_jobs`, with country hashtags instead of one channel per
   country. PLAN D27 and phase 11 are amended.
3. **Staging shares the production OpenRouter keys** (no separate workspace).
4. **Railway runs on the Hobby plan**, in the workspace next to Syncra, rabot-ai and iBeep. Check its
   resource limits when adding web, worker, bot, Postgres and a bucket in two environments.
5. The desertant screenshots were purged from history, as described above.

## Still pending (owner)

- Dodo and Paddle pre-clearance emails. The lead needs the SRL legal name, the signer's name and
  title, and a sending address. hello@pemby.app only receives mail.
- Accountant call. Optional: the rabota.md and DOU partnership emails.

## UNVERIFIED items

- Resolved: how OpenRouter per-key guardrails combine with account privacy settings. Stricter wins;
  proven live.
- Open: whether the OpenRouter free daily cap of 1,000 requests is per account or per key.
- Open: Better Auth's exact callback path. It only matters when OAuth returns.

## Notes for phase 01

- Railway project `pemby`; the local directory is linked to it by `railway init`. Push values with the
  scratchpad pattern: parse dotenv in-process and call `variableUpsert` over stdin. Never echo a value.
- Custom domains need Cloudflare DNS records. The lead has no Cloudflare API token, so the owner adds
  the CNAMEs Railway prints.
- `test.md` is to be deleted in the scaffold commit (owner decision).
- The progress page from phase 02 is still owed and belongs to phase 01.
