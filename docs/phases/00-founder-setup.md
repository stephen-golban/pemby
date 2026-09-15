# Phase 00: founder setup

Read `docs/phases/_COMMON.md` first. This phase is different: most of the steps are things only the
owner can do (accounts, KYC, emails, DNS). Your job as lead is to walk the owner through them one at
a time, verify each step from this machine where you can, and record what exists. Never ask for
secret values in the conversation. Secrets go straight into Railway variables or a local `.env` file
that is gitignored.

## Read first

- `docs/PLAN.md` sections 2 and 7
- `docs/research/06-payments-moldova.md`, `docs/research/14-mor-acceptable-use.md` (payments)
- `docs/research/11-it-park-eligibility.md` (last section: questions for the accountant)
- `docs/research/08-hirify-and-telegram.md` (Telegram bot setup)
- `docs/research/10-openrouter-free-models.md` (two-key setup)

## Goal

By the end, every external account Pemby needs exists, the payment pre-clearance emails are sent, and
`docs/SETUP.md` lists each account, who owns it, which env var names it provides (never values), and
what is still pending.

## Checklist (walk the owner through it in this order)

1. **GitHub repo.** Ask which GitHub account should own `pemby`. The owner creates a public repo. Add
   the local repo's remote. The local repo already exists with an empty `test.md`; ask before touching it.
2. **Railway.** Account and a project named `pemby`. Use the `use-railway` skill to confirm access.
3. **Cloudflare.** Move pemby.app DNS to Cloudflare if it isn't there. Create a Turnstile widget for
   `pemby.app` and `staging.pemby.app`. Turn on Email Routing for `hello@pemby.app` to the owner's inbox.
   Verify with `dig NS pemby.app` and `dig MX pemby.app`.
4. **OpenRouter.** Account, a $10 credit top-up (raises the free-model daily cap to 1,000 requests),
   and two API keys: `OPENROUTER_KEY_PUBLIC` (may use free models that train on inputs) and
   `OPENROUTER_KEY_PRIVATE` (zero data retention enforced by its guardrail). Then create a second pair
   for staging, stored as `OPENROUTER_KEY_PUBLIC` and `OPENROUTER_KEY_PRIVATE` in the Railway staging
   environment, each with a small per-key credit limit set in OpenRouter. Leave account-level ZDR off,
   because it would block the free Nemotron route. ZDR is enforced by the guardrail on the private key
   plus `provider.zdr: true` on every personal-data request. Before creating the keys, confirm
   in the OpenRouter UI how per-key guardrails and account privacy settings combine (UNVERIFIED in
   research 10).
5. **Telegram.** Create the bot with @BotFather (name "Pemby", username to be chosen by the owner),
   set the description, and store `TELEGRAM_BOT_TOKEN`. The owner sends `/start` to the production bot;
   the lead reads the chat id from `getUpdates` and stores it as `OWNER_TELEGRAM_CHAT_ID`. Create a
   second bot for staging. Create the
   public channel `@pemby_moldova` (name to confirm) with the bot as admin.
6. **Resend.** Account, verify the `pemby.app` sending domain with the DNS records Resend provides.
7. **OAuth apps.** GitHub OAuth app and Google OAuth client, one pair for production and one for
   staging. Callback URLs depend on Better Auth's routes; phase 01 confirms the exact paths, so create
   these apps now and fill callback URLs in phase 01.
8. **Sentry and PostHog.** Free accounts. Confirm current free-tier limits on their pricing pages and
   note them in `docs/SETUP.md`.
9. **Payments pre-clearance.** The owner sends the two emails below, from `hello@pemby.app` or their
   company address. Actual applications happen after phase 03 deploys the pricing and legal pages.
10. **Accountant.** The owner books a short call and brings the questions at the end of research 11.
    Key point: declare CAEM 58.29 and 63.11 in the IT Park contract.
11. **Juniors sources.** Optional now, useful soon: the owner sends the partnership emails below to
    rabota.md and DOU.

## Email drafts

Fill in the bracketed parts with the owner. Keep them short and factual.

### To Dodo Payments (sales or support)

Subject: Pre-application check: AI job-matching software, Moldovan IT Park company

Hi,

I'm preparing to apply for a Dodo Payments merchant account and want to confirm fit before we build
the integration.

Product: Pemby (pemby.app), AI job-matching software for software engineers and IT people. It reads
public company career pages, matches jobs to a user's CV and eligibility, sends alerts by Telegram,
email and web push, and helps users prepare application materials. Users apply to employers
themselves. We don't sell job ads, we don't place candidates and we don't charge employers.

Pricing: one-time access passes of $5 for 1 month, $10 for 3 months and $18 for 6 months, with no
auto-renewal. Refunds within 7 days.

Seller: [legal name of SRL], registered in Chisinau, Moldova, and a Moldova IT Park resident.

Questions:
1. Would you accept this product under your merchant acceptance policy?
2. Can you pay out by USD SWIFT wire to a USD account at MAIB (Moldova)? What are the fees and schedule?
3. Can one-time products grant access for a fixed period that we enforce in our app?

Thanks,
[name], [title], [company]

### To Paddle (sales)

Subject: Pre-application check: AI job-matching software (not a job board), Moldovan seller

Hi,

Before applying, I'd like to confirm Pemby fits Paddle's acceptable use policy. I noticed "Advertising
Services, including job boards" is prohibited, so I want to be precise about what we sell.

Pemby (pemby.app) is AI job-matching software sold to individual job seekers in tech. It matches public
job listings from company career pages to a user's CV and country eligibility, alerts them, and helps
them prepare application materials. We sell no advertising, list no paid job posts, charge employers
nothing and place no candidates. Users apply themselves.

Pricing: one-time passes ($5 / 1 month, $10 / 3 months, $18 / 6 months), no auto-renewal.

Seller: [legal name of SRL], Moldova IT Park resident. Payouts would go to a USD account at MAIB.

Could you confirm whether this is acceptable, and whether USD SWIFT payouts to Moldova are available?

Thanks,
[name], [title], [company]

### To rabota.md and DOU (partnership)

Subject: Partnership request: listing your IT vacancies in Pemby

Hi,

I'm [name], a Moldovan engineer building Pemby (pemby.app), AI job-matching software for tech people
in Eastern Europe. Many of our users are juniors who are mostly hired locally, and your IT listings
would help them a lot.

Your terms don't allow automated collection without consent, so I'm asking for permission, or an
official feed or API. We would show each vacancy's title, company and a short summary, link every job
back to your page for the application, and credit you as the source.

Could we talk about this?

[name], [company], [link]

## Definition of done

- `docs/SETUP.md` exists and lists every account above with status (done, pending, blocked), the env
  var names each provides, and where the value is stored. No secret values.
- DNS checks pass for Cloudflare nameservers and email routing (show the `dig` output).
- The owner confirms the Dodo and Paddle emails were sent (date noted in SETUP.md).
- Handoff written to `docs/phases/handoffs/00-handoff.md`.

Partial completion is fine. Phase 01 can start once GitHub, Railway, Cloudflare DNS, OpenRouter,
Resend domain verification, the Turnstile widget, and the GitHub and Google OAuth apps exist. OAuth
callback URLs can be filled in during phase 01. Record anything still pending so later phases know.
