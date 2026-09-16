# Pricing page copy

Source copy for `/pricing`. Each line is `key`, then the English string. Keys follow the `apps/web/messages/en.json` convention, under a `Pricing` namespace, so the whole file can move into i18n messages as-is. Text in `{braces}` is an ICU placeholder. Notes for the builder are in blockquotes and are not page copy.

> Passes are shown before a payment provider is live. Do not name any provider on this page. Checkout arrives in phase 10. Until then the pass buttons show the `cta.notOpen` state below. It is a plain status line, never a waitlist, an email capture or a sign-in wall.

## Hero

- `hero.eyebrow`: Pricing
- `hero.title`: Free to start. A pass when you want matches the moment they appear.
- `hero.lede`: Pemby is AI job-matching software. It finds jobs that can hire you from your country and sends them to you. You apply yourself.
- `hero.noteOneTime`: Free costs nothing. A pass is a one-time payment: no auto-renew, no subscription to cancel.

## Free vs Pass

- `compare.title`: What you get
- `compare.colFeature`: Feature
- `compare.colFree`: Free
- `compare.colPass`: Pass

| key                       | Feature                                                       | Free                           | Pass                     |
| ------------------------- | ------------------------------------------------------------- | ------------------------------ | ------------------------ |
| `compare.rows.cvParse`    | CV reading and profile                                        | Yes                            | Yes                      |
| `compare.rows.onboarding` | Onboarding in three steps                                     | Yes                            | Yes                      |
| `compare.rows.brief`      | Your Brief, with near misses and what blocked them            | Yes                            | Yes                      |
| `compare.rows.delivery`   | Match delivery on Telegram, email and web push                | 24 hours after the job appears | The moment it appears    |
| `compare.rows.kits`       | Application kits: CV bullets, cover letter, screening answers | 3 per month                    | Unlimited                |
| `compare.rows.green`      | Green matches: hires from your country                        | Yes                            | Yes                      |
| `compare.rows.yellow`     | Yellow matches: likely hires from your country                | No                             | Optional, you turn it on |
| `compare.rows.guarantee`  | No-match guarantee                                            | No                             | Yes                      |

- `compare.freeNote`: Free matches arrive 24 hours late, and each late message says so.
- `compare.quietNote`: Your quiet hours apply on Free and on a pass. Messages wait until quiet hours end.
- `compare.ownKeyNote`: Need more kits without a pass? Connect your own OpenRouter account and pay OpenRouter directly for what you use.

## Passes

- `passes.title`: Passes
- `passes.lede`: Pick how long you want instant matches. Every pass has the same features.
- `passes.currencyNote`: Prices in US dollars. Tax may be added at checkout, depending on where you live.

### 1 month

- `passes.oneMonth.name`: 1 month
- `passes.oneMonth.price`: $5
- `passes.oneMonth.duration`: 30 days of access
- `passes.oneMonth.perMonth`: $5 once

### 3 months, highlighted

> Visually highlighted card.

- `passes.threeMonths.badge`: Recommended
- `passes.threeMonths.name`: 3 months
- `passes.threeMonths.price`: $10
- `passes.threeMonths.duration`: 90 days of access
- `passes.threeMonths.perMonth`: $10 once, about $3.33 a month

### 6 months

- `passes.sixMonths.name`: 6 months
- `passes.sixMonths.price`: $18
- `passes.sixMonths.duration`: 180 days of access
- `passes.sixMonths.perMonth`: $18 once, $3 a month

### Shared pass lines

- `passes.includes`: Instant delivery, unlimited kits, yellow matches if you want them, and the no-match guarantee.
- `passes.oneTime`: One-time payment. No auto-renew.

## Pass buttons

- `cta.buy`: Buy {duration}

> `cta.buy` is for phase 10, when checkout exists. Until then, render the button disabled with `cta.notOpen` and `cta.notOpenDetail` under it. The free button stays live and leads to the CV drop, or to the landing page stand-in until phase 06 wires the CV drop.

- `cta.notOpen`: Not on sale yet
- `cta.notOpenDetail`: Passes cannot be bought on this site yet. Nobody is charged.
- `cta.startFree`: Start free with your CV

## How passes work

- `how.title`: How passes work
- `how.oneTime.title`: One payment, fixed time
- `how.oneTime.body`: A pass is a single payment for 30, 90 or 180 days of access. It never renews. We never charge you again unless you buy another pass.
- `how.stack.title`: Renewals stack
- `how.stack.body`: Buy a new pass before your current one ends and the new days are added to the end. You lose no time.
- `how.reminder.title`: A reminder before it ends
- `how.reminder.body`: We remind you 5 days before your pass ends. When it ends, your account returns to Free. Your profile, matches and kits stay.

## Refunds

- `refunds.title`: 14-day refunds
- `refunds.body`: Changed your mind? Email hello@pemby.app within 14 days of buying a pass and we refund the full price. No reason needed. A refund ends that pass.
- `refunds.link`: Read the refund policy

## No-match guarantee

- `guarantee.title`: No-match guarantee
- `guarantee.body`: If your active pass sends you zero matches for 14 days in a row, we add 14 days to it. You do not need to ask.
- `guarantee.scope`: The guarantee covers pass time. It is not a promise about jobs, interviews or offers.

## Landed a role

- `landed.title`: Landed a role?
- `landed.body`: Tell Pemby and pause your pass. The remaining days wait for you until you resume.

## What Pemby is

- `whatItIs.title`: Software, not an agency
- `whatItIs.body`: Pemby is AI job-matching software. It does not place candidates with employers, it does not apply for you, and employers do not pay us. You decide where to apply and you send every application yourself.

## FAQ

- `faq.title`: Questions

### Is a pass a subscription?

- `faq.subscription.q`: Is a pass a subscription?
- `faq.subscription.a`: No. A pass is a one-time payment for a fixed number of days. It does not renew and there is nothing to cancel.

### What happens when my pass ends?

- `faq.ends.q`: What happens when my pass ends?
- `faq.ends.a`: Your account returns to Free. Matches arrive 24 hours late again and you get 3 kits a month. Nothing is deleted.

### Can I buy another pass before mine ends?

- `faq.stack.q`: Can I buy another pass before mine ends?
- `faq.stack.a`: Yes. The new days are added after your current pass, so you lose no time.

### What if Pemby finds nothing for me?

- `faq.nothing.q`: What if Pemby finds nothing for me?
- `faq.nothing.a`: Pemby tells you plainly and shows what blocked the closest jobs, such as no salary listed or a seniority gap. If this lasts 14 days during an active pass, we add 14 days to the pass.

### Does Pemby get me a job?

- `faq.outcome.q`: Does Pemby get me a job?
- `faq.outcome.a`: No. Pemby finds jobs that can hire you from your country and helps you prepare your application. The employer decides, and you apply yourself.

### What is an application kit?

- `faq.kit.q`: What is an application kit?
- `faq.kit.a`: Draft CV bullets, a short cover letter and answers to screening questions for one job, based on your own CV. You read, edit and paste them.

### What do green and yellow mean?

- `faq.tiers.q`: What do green and yellow mean?
- `faq.tiers.a`: Green means the job post or the company shows it hires from your country. Yellow means it likely does, but the evidence is weaker. Every label shows its reason.

### Where do the jobs come from?

- `faq.source.q`: Where do the jobs come from?
- `faq.source.a`: From public job posts on company career pages and the applicant tracking systems companies use to publish them. Pemby re-checks each open job at least every 12 hours.

### What happens to my CV?

- `faq.privacy.q`: What happens to my CV?
- `faq.privacy.a`: Pemby uses it only to match you and draft your kits. AI requests with your data require zero data retention. We never sell it or share it with employers. If you upload without an account and do not sign up, we delete it after 24 hours.
- `faq.privacy.link`: Read the privacy policy

### How do I ask for a refund?

- `faq.refund.q`: How do I ask for a refund?
- `faq.refund.a`: Email hello@pemby.app within 14 days of buying the pass, from the email you used at checkout.

## Footer strip

- `footer.contact`: Questions? hello@pemby.app
- `footer.terms`: Terms of service
- `footer.privacy`: Privacy policy
- `footer.refunds`: Refund policy
