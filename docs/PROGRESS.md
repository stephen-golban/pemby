# Progress

- **Progress page (private claude.ai artifact):** https://claude.ai/artifact/RHdWgXQpDd35nYMcKaodRR
  Every phase lead reads it with the Artifact tool and republishes it with `url` after each work unit.
- **Staging:** https://staging.pemby.app, behind HTTP basic auth. User and password are the
  `STAGING_BASIC_AUTH_USER` / `STAGING_BASIC_AUTH_PASSWORD` shared variables in Railway (project
  `pemby`, environment staging). Sign-up is open on staging. Demo data is fictional.
- **Production:** https://pemby.app (Railway environment `production`: `web` and `Postgres`), live since
  2026-09-17. Public pages are open; `/app` is owner-only and sign-up is closed. Cloudflare record is
  DNS only; `www` redirects to the apex through a Cloudflare redirect rule. Production Postgres has no
  public TCP proxy.
