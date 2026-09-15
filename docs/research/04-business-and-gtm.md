# 04 — Business model and go-to-market for Pemby

Researched 2026-09-15 for Pemby (pemby.app): a job-search app for developers and IT people, aimed at candidates from countries that remote jobs usually exclude (Moldova, non-EU Eastern Europe, LATAM, Africa, South Asia). Solo founder in Moldova, hosted on Railway.

**Source labels.** Each claim has a URL. **[primary]** means a first-party page I fetched (vendor pricing page, docs, or the founder's own post). **[secondary]** means a third-party write-up or a search-result summary, because the first-party page blocked the fetcher (HTTP 403/404). **[estimate]** means my own arithmetic from the cited prices. **[uncertain]** marks anything that could not be confirmed.

---

## 1. Monetization models

### 1a. Seeker subscriptions

| Product | Price | What paid unlocks | Source |
|---|---|---|---|
| Himalayas Plus / Max | $9/mo / $29/mo. Free tier gives one resume, one cover letter, one mock interview and one coaching session | Unlimited AI resume, cover letter and coaching tools, AI headshots, daily job alerts | [primary] https://himalayas.app/plus, https://himalayas.app/pricing |
| LazyApply | $99/yr (15 applications/day), $149/yr (150/day), $999/yr (1,500/day). Annual only, 30-day money-back guarantee | Auto-apply volume | [primary] https://lazyapply.com/pricing |
| Teal+ | $13/wk, $29/mo, $79/quarter | AI resume tailoring, unlimited tracking | [secondary] https://applyarc.com/compare/teal-pricing, https://resumegenius.com/reviews/teal-resume-builder-reviews. tealhq.com returned 403. **[uncertain]** |
| Jobright Turbo | $39.99/mo (reportedly up from $29.99), $17.99/wk, $89.99/quarter | AI matching, tailoring, "copilot" features | [secondary] https://outapply.com/blog/jobright-ai-pricing. jobright.ai/pricing returned 404. **[uncertain]** |
| Remote Rocketship | $5/wk or $18/mo as of June 2024 | Access to all listings: the jobs themselves sit behind the paywall | [secondary interview] https://nubela.co/blog/how-lior-neu-ner-grew-his-job-board-remote-rocketship/. Newer figures conflict ($29/mo or $79/yr per a 2026 review citing a founder Trustpilot reply): https://www.careerhound.io/remote/remote-rocketship-review/. **[uncertain: current price]** |

**Published revenue for seeker-paid boards**
- **Remote Rocketship:** "$6,000" MRR, with about $500/mo in expenses, of which about $300 is ScrapingBee. Solo founder. Stack: Next.js, Supabase and ChatGPT for data extraction. Source: founder interview, https://boringcashcow.com/interview/interview-with-the-founder-of-remote-rocketship; the showcase dates it to November 2023, https://boringcashcow.com/showcase/boring-business-showcase-these-founders-make-boring-job-boards-lucrative.
- **Himalayas:** reported $67.74 revenue in November 2021 with 17,988 users ([primary] https://himalayas.app/advice/november-2021-monthly-update), and $3,870 in May 2022 with 86,125 visitors ([primary] https://himalayas.app/advice/may-2022-monthly-update). Himalayas has since moved money-making to the seeker side (Plus/Max) and made employer posting free ([primary] https://himalayas.app/pricing).

### 1b. Pay-per-application / auto-apply
- LazyApply is the clearest public example. It sells daily application quotas rather than single applications ([primary] https://lazyapply.com/pricing). I found no primary pricing for a true pay-per-application product. **[uncertain]** Mass auto-apply also carries reputation risk with employers. That risk is my own judgment, not something a source here states.

### 1c. Employer-side job-post fees

| Board | Price | Source |
|---|---|---|
| Remotive | $299 for 30 days; $358 / $398 / $448 visibility tiers; bundles up to 40% off (updated 2025-11-19) | [primary] https://support.remotive.com/en/article/for-recruiters-how-much-does-it-cost-1cdq0y7/ |
| We Work Remotely | $299 per 30-day listing; $199 "Boost" add-on; bundles up to 40% off | [secondary] search summary of https://support.weworkremotely.com/how-much-does-it-cost-to-post-at-we-work-remotely (fetch returned 403). **[uncertain]** |
| Remote OK | "Starting from $299 for 30 days". One review saw $447 at checkout on 2026-08-07 | [secondary] https://www.betterteam.com/remote-ok, https://remoteok.com/buy-bundle (not fetched). **[uncertain]** |
| Himalayas | Free to post, with paid visibility boosts | [primary] https://himalayas.app/pricing |

**Remote OK / Pieter Levels revenue**
- 2017-12-07: RemoteOK made "$2,342.04 in a day" from a single PHP file ([primary] https://levels.io/remoteok-single-php-file-revenue).
- 2019-05-30: Nomad List and Remote OK together made "$83,333+/mo", with 11,996 customers, a $115 average payment, "0 ad budget" and "0 funding", "4 years to get here" ([primary] https://levels.io/4-years-to-1m-revenue-nomad-list-remote-ok).
- October 2023: about $54k/mo, attributed to Levels' X account ([secondary] https://boringcashcow.com/showcase/boring-business-showcase-these-founders-make-boring-job-boards-lucrative).
- A November 2025 figure of about $41k/mo appears only in secondary aggregation (e.g. https://nomadicblueprint.com/case-studies/pieter-levels). **[uncertain]** remoteok.com/open returned 403.

### 1d. Placement fees and marketplace take rate
- **Arc:** freelance developers at "$15 – $110+" per hour; full-time hires cost "20% of the annual salary" ([primary] https://arc.dev/pricing).
- **Braintrust:** "$0 Fees for Talent" ([primary] https://www.usebraintrust.com/payments). Clients pay 15% on each invoice, billed as a separate "Braintrust Fee Invoice" ([secondary] search summary of https://support.usebraintrust.com/hc/en-us/articles/14305375322263-What-is-the-Braintrust-Fee-Invoice; the article returned 403). **[uncertain: exact current %]**
- Both models need vetting, sales, contracts and money movement, which is ops-heavy. Separately, Stripe's own merchant-of-record product "doesn't support ... Connect (platform or marketplace integrations)" ([primary] https://docs.stripe.com/payments/managed-payments).

### 1e. Affiliate revenue (EOR and payments)

| Program | Payout | Fit for Pemby | Source |
|---|---|---|---|
| Deel | "$500 USD for each sales qualified referral, and $1,000 USD for each new paying customer". 90-day window, run through PartnerStack | Employer side: companies hiring a Moldovan contractor or employee through an EOR | [primary] https://www.deel.com/partner/affiliates/ |
| Remote.com | 10% revenue share in months with ≤$2,500 referred, 15% above that. Paid for the customer's first year; 90-day window | Employer side | [primary] https://remote.com/partners/affiliates |
| Wise | £10 per personal user and £50 per business user, triggered by the first cross-currency transfer. 365-day cookie, via Partnerize | Candidate side: getting paid in USD/EUR | [secondary] https://wecantrack.com/programs/wise-affiliate-program/. The first-party page https://wise.com/gb/affiliate-program/ only says business referrals pay "a higher commission rate". **[uncertain: amounts]** |
| Payoneer | "Up to $25" per referral that becomes active; 30-day cookie | Candidate side | [secondary] https://uppromote.com/affiliate-directory/payoneer/ (payoneer.com returned 403). **[uncertain]** |

### 1f. Which model works best for a two-sided cold start
- **Seeker-paid first, employer-paid later.** Remote Rocketship reached about $6k MRR with no employer sales. It aggregates jobs, and seekers pay for access and filtering (sources above). Himalayas earned $67.74 in a month with about 18k users while it was employer-oriented. It has since made posting free and charges seekers. Remote OK's $299+ posts work because of roughly a decade of traffic. My inference from these cases: employer fees need an audience first, and Pemby has none yet.
- **Affiliates are a cheap add-on, not a base.** Deel pays $1,500 per closed customer, but conversion depends on employer traffic Pemby won't have early. Wise and Payoneer match the audience (contractors paid across borders) but pay £10–$25 per user. **[estimate]** It takes about 100 Wise activations to earn roughly £1,000.
- **Defer placement and take-rate models.** They need ops, and Stripe's merchant-of-record product doesn't support marketplace flows (above).

---

## 2. Payments for a founder based in Moldova

| Option | Available from Moldova? | Fees | Source |
|---|---|---|---|
| **Stripe direct** | **No.** Moldova is not on Stripe's supported-countries list | — | [primary] https://stripe.com/global |
| **Stripe Managed Payments** (Stripe's merchant of record; where Lemon Squeezy is being folded) | **No.** Supported business locations are CA, US, EU/EEA, CH, GB, NO, LI, AU, HK, JP and SG. MD is not listed. A US LLC would qualify | 3.5% on top of standard Stripe fees. Standard US fees are 2.9% + 30¢, plus 1.5% for international cards and 1% for currency conversion | [primary] https://docs.stripe.com/payments/managed-payments/eligibility, https://support.stripe.com/questions/managed-payments-pricing?locale=en-GB, https://stripe.com/pricing |
| **Stripe Atlas** (Delaware LLC or C-corp, then a US Stripe account) | Likely yes. Atlas says "Start a US company from anywhere in the world". The sanctions exclusions reported (Cuba, Iran, North Korea, Syria, Russia, Belarus and occupied Ukrainian regions) don't include Moldova | $500 one-time (includes first-year registered agent), then $100/yr; $2,500 in Stripe credits. The $500 is refunded if you deposit $5,000 in Stripe Treasury. Standard Stripe fees then apply. US tax filing obligations for a foreign-owned LLC are not researched here: **[uncertain]**, see https://docs.stripe.com/atlas/business-taxes | [primary] https://stripe.com/atlas, https://docs.stripe.com/atlas. Exclusions are [secondary]: https://www.rho.co/blog/stripe-atlas-review. **[uncertain: Moldova explicitly]** |
| **Paddle** (merchant of record) | Likely yes. Moldova is not on Paddle's unsupported seller-country list | 5% + 50¢ per transaction. "Products under $10 require contacting Paddle for custom pricing" | [primary] https://www.paddle.com/pricing, https://www.paddle.com/help/start/intro-to-paddle/which-countries-are-supported-by-paddle |
| **Polar.sh** (merchant of record) | **Yes, explicitly.** Moldova is on the Stripe Connect Express payout list | Starter 5% + 50¢; Pro ($20/mo) 3.8% + 40¢; Growth ($100/mo) 3.6% + 35¢. +1.5% for non-US cards. Payouts cost $2/mo while active, plus 0.25% + $0.25 per payout, plus 0.25–1% FX. $15 per dispute | [primary] https://polar.sh/resources/pricing, https://polar.sh/docs/merchant-of-record/supported-countries |
| **Lemon Squeezy** (merchant of record, owned by Stripe) | **[uncertain]** Payout-country docs returned 403. New signups are being steered to Stripe Managed Payments, which excludes Moldova | 5% + 50¢; +1.5% international; +1.5% PayPal; +0.5% subscriptions; 1% on international bank payouts | [secondary] https://www.swell.is/content/lemon-squeezy-pricing, https://fungies.io/lemon-squeezy-stripe-acquisition-saas-founders-2026/. Status post (403): https://www.lemonsqueezy.com/blog/2026-update |

**[estimate] Fees on a $12/month subscription paid with a non-US card**

| Option | Calculation | Fee | Notes |
|---|---|---|---|
| Polar Starter | 6.5% × $12 + $0.50 | $1.28 (10.7%) | Before payout and FX fees |
| Paddle | 5% × $12 + $0.50 | $1.10 (9.2%) | |
| Lemon Squeezy | 7% × $12 + $0.50 | $1.34 (11.2%) | |
| US LLC + Stripe + Managed Payments | 7.9% × $12 + $0.30 | $1.25 (10.4%) | Plus Atlas setup and upkeep |
| US LLC + Stripe, handling tax yourself | 4.4% + 0.7% Billing, × $12, + $0.30 | $0.91 (7.6%) | VAT/sales-tax compliance is on you |

A fixed 50¢ fee is 10% of a $5 weekly plan. Quarterly or annual pricing avoids that.

**Verdict:** start on Polar, the only merchant of record here that confirms Moldovan payouts, or Paddle. Move to Atlas and Stripe once monthly revenue is high enough that the ~3–4 point fee difference exceeds Atlas and accounting costs. **[estimate]** Roughly $2–3k MRR.

---

## 3. Go-to-market: what brought job boards and dev tools their first users

| Tactic | Case and numbers | Source |
|---|---|---|
| **Reddit launch** | Remote Rocketship launched January 2023 on Reddit (r/InternetIsBeautiful, r/overemployed): "150,000 visitors in one day, which crashed the site" | https://nubela.co/blog/how-lior-neu-ner-grew-his-job-board-remote-rocketship/, https://boringcashcow.com/interview/interview-with-the-founder-of-remote-rocketship |
| **Programmatic SEO + Google Jobs** | Remote Rocketship: early write-up at 19,000 monthly clicks; 450,000 monthly clicks by 2025-02-25 after about 2 years. Tactics: fill every JobPosting field, internal links from job pages, thousands of pages combining title, location, level and type, and Search Console "Job postings" audits | https://boringcashcow.com/interview/interview-with-the-founder-of-remote-rocketship, https://jboard.io/blog/lior-neuner-remoterocketship-podcast |
| **Google's remote-job rules** (the key lever for "jobs open to Moldova") | Remote jobs need `jobLocationType: TELECOMMUTE` plus at least one country in `applicantLocationRequirements`. Expired jobs must be removed via `validThrough`, 404/410, or dropping the markup, or risk "a manual action". Third-party job sites may use the markup | [primary] https://developers.google.com/search/docs/appearance/structured-data/job-posting |
| **Hacker News** | Himalayas reached the top of HN on 2022-05-11 and had its biggest day, "more than 17k visitors". Revenue that month was $3,870 | [primary] https://himalayas.app/advice/may-2022-monthly-update |
| **Show HN job-board reach** (points, not users) | "developers without degrees" board 343 pts (2019); CommitAsync 204 pts (2024); remoteswe.fyi aggregator 195 pts (2025-05-19); HN Match Maker 125 pts (2026-09-01). Niche, identity-driven boards do well, which suits Pemby's "excluded countries" angle | [primary] HN Algolia API: https://hn.algolia.com/api/v1/search?query=job%20board&tags=show_hn, https://hn.algolia.com/api/v1/search?query=remote%20jobs&tags=show_hn |
| **Product Hunt** | Himalayas' Product Hunt Daily Digest feature brought only "726 visitors in May" 2022, far behind HN | [primary] https://himalayas.app/advice/may-2022-monthly-update |
| **Short video / social** | Himalayas, November 2021: a creator's TikTok got "75k+ views"; users that month were 17,988 (+96.7% MoM) | [primary] https://himalayas.app/advice/november-2021-monthly-update |
| **Build in public** | Levels: $83,333+/mo with "0 ad budget", posted on X ([primary] https://levels.io/4-years-to-1m-revenue-nomad-list-remote-ok). Himalayas published monthly traffic and revenue updates (links above) | — |
| **Open-source components** | Resume-Matcher: 28.4k stars, Apache-2.0 ([primary] https://github.com/srbhr/Resume-Matcher). OpenResume: 8.9k stars, AGPL-3.0 ([primary] https://github.com/xitanggg/open-resume). Stars show demand for OSS job tools. **[uncertain]** No public data on how stars converted to paid users | — |

Caveat: no source gave a clean "first 1,000 users" count. The numbers above are traffic and revenue at the stated dates.

---

## 4. Cold-start liquidity: jobs on day 1 without employers

- **Public ATS endpoints (free, no auth):**
  - Greenhouse: "Job Board data is publicly available, so authentication is not required for any GET endpoints". `GET https://boards-api.greenhouse.io/v1/boards/{board_token}/jobs` ([primary] https://docs.greenhouse.io/job-board.html).
  - Lever: "all job postings in the `published` state are publicly viewable. These jobs may be scraped by third parties". `GET https://api.lever.co/v0/postings/{site}` ([primary] https://github.com/lever/postings-api).
  - Ashby: `GET https://api.ashbyhq.com/posting-api/job-board/{JOB_BOARD_NAME}?includeCompensation=true` ([primary] https://developers.ashbyhq.com/docs/public-job-posting-api).
- **Remote Rocketship's method:** used ScrapingBee to search Google for ATS links (Workable, Greenhouse, Lever), checked daily. It covered 30,000+ companies in 2024, enriched via Proxycurl ([secondary interview] https://nubela.co/blog/how-lior-neu-ner-grew-his-job-board-remote-rocketship/). It now claims "over 180,000 company career pages" ([primary] https://www.remoterocketship.com/is-remote-rocketship-legit/).
- **HN "Who is hiring":** HN API at `https://hacker-news.firebaseio.com/v0/`, "There is currently no rate limit" ([primary] https://github.com/HackerNews/API).
- **Remotive API has conditions that clash with a paywall:** a 24-hour delay; link back and credit Remotive; "more than 2x per minute" gets blocked; and using its jobs "to collect signups/email addresses to show a listing constitutes a breach". So Remotive jobs can't sit behind a Pemby signup wall ([primary] https://github.com/remotive-io/remote-jobs-api).
- **Paid aggregators:**
  - JSearch (Google for Jobs data): free 200 requests/mo; $25/mo for 10k; $75 for 50k; $150 for 200k ([primary] https://www.openwebninja.com/api/jsearch).
  - TheirStack: $49/mo for 1,500 credits up to $1,500/mo for 1M, at 1 credit per job ([primary] https://theirstack.com/en/pricing).
  - Adzuna needs an app_id/app_key; pricing and terms were not on the overview page ([primary] https://developer.adzuna.com/overview). **[uncertain]**
- **Pemby's edge:** eligibility for a given country is the scarce data. Pemby can extract it from ATS location text and `applicantLocationRequirements` with an LLM classifier, then publish "remote {role} jobs open to {country}" pages. The page idea is my synthesis of the Google markup rules and Remote Rocketship's page combinations above.
- **Seeding the employer side:** Himalayas made posting free ([primary] https://himalayas.app/pricing). Pemby can do the same until traffic exists.

---

## 5. Unit economics

### LLM pricing ([primary] https://platform.claude.com/docs/en/about-claude/models/overview, https://claude.com/pricing)

| Model | API ID | Input / Output per MTok | Cache read / write | Batch | Context |
|---|---|---|---|---|---|
| Claude Sonnet 5 | `claude-sonnet-5` | $2 / $10 | $0.20 / $2.50 | 50% off | 1M |
| Claude Haiku 4.5 | `claude-haiku-4-5` (snapshot `claude-haiku-4-5-20251001`) | $1 / $5 | $0.10 / $1.25 | 50% off | 200K |

Two caveats:
- Haiku 4.5's retirement is "Not sooner than October 15, 2026", about a month out, so plan a migration path.
- The current tokenizer fits about 555k words per 1M tokens on newer models, versus about 750k words on older ones such as Haiku 4.5 (same source). **[estimate]** That is about 1.8 tokens/word on Sonnet 5 and 1.33 on Haiku 4.5.

### [estimate] Cost per operation (assumes a 2-page CV ≈ 1,500 words and a job description ≈ 800 words)

| Operation | Model | Tokens (in / out) | Cost |
|---|---|---|---|
| CV parse to JSON | Haiku 4.5 | 3.5k / 1.2k | **≈ $0.0095** |
| CV parse to JSON | Sonnet 5 | 4.2k / 1.5k | **≈ $0.023** |
| Eligibility/location classification per job | Haiku 4.5, batch | 1.5k / 0.15k | **≈ $0.0011** |
| Tailored CV + cover letter | Sonnet 5 (incl. ~2k thinking tokens) | 6.2k / 5.2k | **≈ $0.064** ($0.032 batched) |
| Tailored CV + cover letter | Haiku 4.5 | 4.6k / 3.5k | **≈ $0.022** |

- **Job classification at 20k new jobs/month:** 20,000 × $0.0011 ≈ **$22/mo**.
- **Heavy paid user, per month:** 60 Sonnet tailorings ($3.84) + 1 parse + LLM re-ranking of the top 20 jobs/day (20 × 30 × $0.00225 × 50% ≈ $0.68) ≈ **$4.50**.
- **Typical user, per month:** 10 tailorings ≈ **$1.30**.

A $9–12/mo plan keeps gross margin above ~50% even for heavy users, after ~10% payment fees.

### Hosting on Railway ([primary] https://railway.com/pricing)
- **Plans:** Free $0 ($1 credit); Hobby $5/mo (includes $5 usage); Pro $20/mo (includes $20 usage).
- **Unit prices:** $20 per vCPU-month; $10 per GB RAM-month; $0.15/GB volume; $0.05/GB egress. Billed per second on actual usage.
- **[estimate] Launch stack:**
  - Web: 0.1 vCPU average, 0.5 GB → $7
  - Postgres: 0.1 vCPU, 1 GB, 5 GB volume → $12.75
  - Ingest worker: 0.2 vCPU, 0.5 GB → $9
  - Egress: 50 GB → $2.50
  - Total ≈ **$31/mo** of usage. On Pro, the $20 credit is used first, so the bill is about $31.

### [estimate] Total monthly cost at launch
- Railway: ~$31
- Claude: ~$22 classification plus ~$1–5 per active paid user
- Job data: free (ATS APIs + HN), or JSearch at $25–75
- Payments: ~10% of revenue
- Remote Rocketship benchmark at $6k MRR: about $500/mo total costs (source in §1a)

**Break-even:** about 10 subscribers at $9 covers a ~$60 fixed base.

---

## Recommended model for Pemby's first 90 days

This section is judgment built on the evidence above; targets are **[estimate]**.

1. **Supply (days 1–14).** Aggregate from the Greenhouse, Lever and Ashby public APIs plus HN "Who is hiring". Do not use Remotive's API: its terms forbid signup-gating. Classify each job's country eligibility with Haiku 4.5 in batch (~$22/mo), and plan the move off Haiku before its October 2026 retirement window. The eligibility label is the product.
2. **SEO surface (days 7–30).** Publish free, indexable pages like "remote {role} jobs open to {country}", with complete JobPosting markup (`TELECOMMUTE` + `applicantLocationRequirements`) and strict expiry handling. This copies Remote Rocketship's path (19k to 450k monthly clicks), aimed at an underserved niche.
3. **Launches (days 21–45).** Post on Reddit first (Remote Rocketship: 150k visitors in a day). Then Show HN framed around the exclusion problem (niche, identity-driven boards score 195–343 pts). Product Hunt is optional (Himalayas: 726 visitors).
4. **Revenue: seeker freemium.** Job browsing and alerts stay free. "Pemby Pro" at about $9/mo or $24/quarter covers Sonnet 5 CV tailoring and cover letters, eligibility-verified alerts, and application tracking. Push quarterly and annual plans to dilute the 50¢ fixed fee. Consider regional pricing for low-income markets (not researched here). Cost is about $1.30–4.50 per user per month.
5. **Payments.** Use Polar (Moldovan payouts confirmed) or Paddle. Skip Atlas until MRR is roughly $2–3k.
6. **Affiliates as a side stream.** Wise/Payoneer links in "how to get paid from abroad" guides; Deel/Remote links on employer-facing "how to hire from Moldova" pages.
7. **Employers (days 45–90).** Free posting, as Himalayas does, to seed exclusive listings. Charge employers (the benchmark is $299 per post) only after meaningful traffic, e.g. more than 50k monthly visitors.
8. **Reputation.** Build in public: monthly metrics posts (Himalayas format) on X and Indie Hackers. Consider open-sourcing the eligibility classifier or country dataset as a GitHub magnet; the star-to-user conversion is **[uncertain]**.
9. **Defer.** Placement fees, take rate, and pay-per-application auto-apply.
10. **90-day targets:** 5k–20k monthly visitors, 1,000 email signups, 50–150 paying users (≈ $450–1,350 MRR). These are directional guesses, not benchmarks from a source.
