# 14 — Merchant-of-Record acceptable use: Paddle, Creem, Polar, Dodo

Researched 2026-09-15 from first-party policy pages only, fetched directly from each site. Quotes are verbatim. Anything not confirmed from a first-party page is marked **UNVERIFIED**.

## What we are asking about

Pemby is a SaaS product from a Moldovan IT Park SRL. Job seekers buy one-time passes that expire and do not auto-renew: $5 for 1 month, $10 for 3 months, $18 for 6 months. A pass unlocks:

- AI-matched job listings, aggregated from public company ATS boards and delivered on the web, Telegram and email.
- AI-generated application materials: a tailored CV, a cover letter and screening answers.

Pemby does not place candidates. It does not charge employers and does not apply to jobs for the user.

## Verdict summary

| MoR | Verdict for Pemby | Deciding clause |
|---|---|---|
| Paddle | **Unclear, high rejection risk.** Prohibited if a reviewer classifies Pemby as a job board. | "Advertising Services, including but not limited to job boards" is on the prohibited list |
| Creem | **Restricted.** Likely declined for a new business. | "Job boards" and "Generative AI products" are restricted and require "An established and proven track record" |
| Polar | **Prohibited.** Restricted at best. | "Job boards" is prohibited; "Resume, hiring, or exam tools" and "Directories and boards" need closer review |
| Dodo Payments | **Restricted (review), and the best fit of the four.** | No job-board ban. "Resume, hiring, or exam tools" and "AI Content Generation tools" are review categories |

---

## 1. Paddle

**Sources**
- AUP (help center): https://www.paddle.com/help/start/intro-to-paddle/what-am-i-not-allowed-to-sell-on-paddle. The seller terms point to `https://paddle.com/support/aup/`, which redirects here. The page says "Last Updated 13 April 2026".
- Seller terms: https://www.paddle.com/legal/terms ("Last updated: 8 October 2025")
- Domain review: https://www.paddle.com/help/start/account-verification/what-is-domain-verification
- Buyer refund policy: https://www.paddle.com/legal/refund-policy

### Verdict: Unclear, high risk

**Job boards (the main problem).** Under "Prohibited Categories", in the "Advertising and marketing" group:
> "Advertising Services, including but not limited to job boards and open houses"

Paddle files job boards under *advertising services*. That is the employer-pays model, and Pemby is not that. But the word "job boards" is on the list, and Pemby's core feature is aggregated job listings. A reviewer reading only the landing page could easily map Pemby onto it. Paddle has no carve-out for boards that job seekers pay for. How Paddle would classify Pemby is **UNVERIFIED**; only a support pre-check or a real domain review would tell us.

**Scope statement.**
> "Paddle is built to serve software companies (including B2B SaaS, Consumer Software, and Games). If your company's primary offering is human services (such as consultation, support, or design services) or the sale of physical goods, Paddle is not a good fit for your needs."

Prohibited:
> "Human services that are not related to a software offering (e.g., pure consulting or advisory services, including but not limited to legal advice, coaching, IT services, and access to a community of experts)"

Pemby is software with no human service, so this clause is fine as long as nothing on the site looks like career coaching.

**AI and content generation.** Under the prohibited heading "Content generation, including but not limited to:":
> "Human-like faces in realistic, stylized, or animated forms (Restricted Category) / Face Swaps / Deep Fakes Images or Videos / Voice Impersonations / Any content generation using a person's likeness without that person's explicit consent / Automated decision-making or categorization of people / Any content generation that falls into other prohibited categories"

Text generation of CVs and cover letters is not named. But "Automated decision-making or categorization of people" is worth watching: Pemby ranks jobs *for* a person and does not rank people for employers. Wording that suggests candidate scoring or screening could trigger this clause.

**Marketplaces.**
> "Any product or service that enables non-Paddle Sellers to sell products and services to customers, such as digital marketplaces"

This does not apply, because employers do not sell through Pemby.

**Other adjacent clauses.**
- > "Certifications and exam preparation services, including but not limited to: essay and paper mills, ghostwriting services"

  AI-written application materials are arguably close to "ghostwriting services". The risk is low, but frame them as a tool that helps the user edit their own materials, not as "we write it for you". This framing risk is my inference; it is **UNVERIFIED** as a Paddle position.
- > "Any product or service that enables unauthorized access to data belonging to another party"

  Keep the public-ATS sourcing clearly lawful. Do not say "scrape".
- Paddle names **no** category for "services where the buyer pays for a chance of an outcome", "career services", "recruitment" or "employment agencies". The closest catch-all is "Involves fraudulent, deceptive, unfair, abusive, or predatory practices" plus "Results in or causes a significant risk of chargebacks".
- Paddle's AUP has **no** clause for "data scraping" by name.

**Enforcement.** Seller terms 9.x: Paddle may act if it "determines (in its absolute discretion) that the Product falls outside of the Acceptable Use Policy or is otherwise outside of Paddle's risk tolerance". Restricted categories: "Paddle must do enhanced due diligence on certain product offerings."

### One-time payments for time-limited access
Paddle's seller terms cover both "a one-off Transaction" and "a subscription service" (clause 10.2). I did not find a first-party page confirming that a one-off price can carry a fixed access window. Pemby would enforce expiry in its own app. **UNVERIFIED** as a Paddle-documented pattern.

### Refund window: yes, 14 days in practice
Seller terms 10.2:
> "As the seller, Paddle shall be entitled to cancel a Transaction and grant the Buyer a refund of the full price paid if: (i) the Buyer requests a refund within fourteen (14) days of the date of a one-off Transaction ... and Paddle determines, in its sole discretion, that a refund is appropriate"

Buyer refund policy, 2.1 and 2.2:
> "Where local consumer protection laws grant unconditional "withdrawal" rights, those rights apply and override this Policy and any Supplier policy. Where regional differences apply, Paddle applies the highest standard of protection across the relevant country"

> "14-day statutory right to withdraw from some digital content and service contracts and receive a full refund."

> "2.2.2. The right to withdraw applies to one-off purchases and to the first payment under a Subscription contract."

> "2.2.4. The right to withdraw does not apply to the supply of digital content Products that have started to be downloaded, streamed or otherwise used, when you have given express consent to waive your withdrawal rights."

What this means for Pemby:
- A 1-month pass bought through Paddle carries a buyer-facing 14-day withdrawal right unless the waiver in 2.2.4 is captured.
- Paddle refunds at its own discretion within 14 days, and the seller bears the cost (seller terms 10.4).
- Whether Paddle's checkout captures the 2.2.4 waiver for SaaS access is **UNVERIFIED**.

### Domain review requirements (verbatim)
> "Ensure the following information is clearly available across your domain(s):
> - A clear description of your product or service
> - Pricing details or a pricing page (a screenshot is acceptable if not yet available)
> - Key features or deliverables included with the purchase
> - Terms and Conditions, Refund Policy, and Privacy Policy (these must be clearly accessible via navigation on your website)
> - Include the company name or sole proprietor's brand (legal name preferred for sole proprietors) in the Terms & Conditions
> - Site must be live and secured with an SSL certificate (HTTPS)
> - Custom/enterprise pricing sheet (if applicable)"

Other points from the same page:
- "Only submit domains that are directly related to the product you're selling via Paddle."
- Manual reviews take "an estimated 5-7 business days".
- Documents Paddle may request include "Test account access – For some product categories, or subdomains requiring login" and a "Processing statement ... covering the last 3 months".
- Rejection reasons include "The products being sold on the website are not in line with our Acceptable Use Policy."

Note that the domain-review list does not mention contact details. Account verification has three phases: "Domain review, Business verification (not required for individuals or sole traders), Identity verification" (https://www.paddle.com/help/start/account-verification/what-is-account-verification).

---

## 2. Creem (Armitage Labs OÜ, Estonia)

**Sources**
- Account reviews, including the prohibited and restricted lists: https://docs.creem.io/merchant-of-record/account-reviews/account-reviews
- Merchant terms: https://www.creem.io/terms ("Effective from: 05.08.2026 (V2.0)")
- Re-review guide: https://docs.creem.io/merchant-of-record/account-reviews/re-review-guide
- One-time payments: https://docs.creem.io/features/one-time-payment
- `creem.io/legal/acceptable-use` and `creem.io/prohibited-products` both return 404. The list lives in the docs.

### Verdict: Restricted, likely declined for a new business

Under "Restricted products / Products subject to strict due diligence":
> "- Services of any kind, including, but not limited to marketing, design, web development, consulting, and similar work
> - Job boards
> - Advertising in newsletters, on websites, or in social media posts
> - API resellers
> - Generative AI products, including, but not limited to text-to-image and text-to-video generation tools
> - Trading and investment communities, courses, and educational products that do not enable trade execution or automation
>
> All restricted products require additional verification, including previous payment processor details, chargeback/refund rate, and reason for moving to Creem. An established and proven track record is required for consideration."

Pemby falls under **two** restricted items: job boards and generative AI. It is a new business with no previous processor history, so it cannot meet "An established and proven track record is required for consideration". Creem's docs do not say this outright for Pemby; it is my reading of that sentence.

Prohibited list items that are nearby but do not apply:
- "Products that operate marketplaces or facilitate third-party merchant-funded customer payouts, including cashback, rebates, referral payouts, rewards, or similar payments from merchants to customers". Pemby has no merchant-funded payouts.
- "Homework/essay mills". This could only be argued if the AI application materials were framed as ghostwriting.
- Creem lists no category for recruitment, employment agencies, career services, scraping or outcome-based services.

Terms 6.4.6: the merchant shall not "offer any Products through the Service that are subject to licensing, authorization or registration requirements ... or that are included in the prohibited products list". Some countries license employment agencies; Pemby is not a placement agency, so say so explicitly.

### One-time payments for time-limited access
> "A one time payment represents a single, non-recurring transaction between you and your customer."

Creem documents no expiry or duration field for one-time products (fetched docs). Pemby would enforce expiry in its app. **UNVERIFIED** whether Creem reviewers object to this pattern.

### Refund window
Creem imposes no fixed window. Terms 11.2:
> "The Merchant is responsible for determining refund eligibility for Products and must request any refund via the functionality provided in the Merchant Account."

Terms 11.3: Creem may refund without instruction where "required by law or applicable consumer protection regulations". EU statutory withdrawal rights therefore still apply through that clause.

Support rule from the account-reviews page:
> "Respond to customer requests within 3 business days. If you do not respond within that timeframe, Creem may issue a refund on your behalf."

### Account review checklist (verbatim table rows)
- "Product is live": "Your product is ready for production."
- "No false information": "No fake reviews, testimonials, or inflated user/customer counts on your website."
- "Privacy Policy & Terms of Service": "Both legal pages must be present and accessible on your website."
- "Product clearly visible": "We must be able to understand what you're selling from your website or landing page."
- "No trademark conflicts"
- "Pricing is visible": "Pricing must be clearly displayed and easy for users to find."
- "Acceptable use": "No high-risk, shady, or illegitimate use cases."
- "Customer support email": "A reachable support email must be set up and shown on your website and receipts."
- "Not on prohibited list"

Also required:
- "Use a branded support email." For Pemby that means support@pemby.app, not a Gmail address.
- The support email must match Business Details.
- Legal pages "must load without authentication".
- No "placeholder or 'coming soon' page".
- "Remove any password protection, maintenance mode, or bot wall that blocks the review team".
- Terms 5.4.3–5.4.4: Creem may require "test account(s) or test credential(s)" and "Access to the data of the Merchant, e.g. in Google Analytics".
- Creem "may create and apply a one-time 100% discount code" to make a test purchase.
- Reviews take "24-48 hours". A rejection "is a final decision for this store".

---

## 3. Polar

**Sources**
- AUP: https://polar.sh/legal/acceptable-use-policy ("Effective Date — March 25, 2026"). Also served at polar.sh/docs/merchant-of-record/acceptable-use.
- Account reviews: https://polar.sh/docs/merchant-of-record/account-reviews
- Products: https://polar.sh/docs/features/products
- Benefits: https://polar.sh/docs/features/benefits/introduction
- Refunds: https://polar.sh/docs/features/refunds

### Verdict: Prohibited (restricted at best)

Polar's list is introduced with: "By using the Services, you confirm that you will not accept payments with any connection to the following business categories and practices." It includes:
> "Job boards;"

On the same list:
> "Human services;"
> "Marketplaces. Selling others' products or services using Polar against an upfront payment or with an agreed upon revenue share;"
> "Advertising and unsolicited marketing services, including, but not limited to, lead generation, bulk SMS and automated outreach;"
> "Open Source Intelligence (OSINT) platforms: Services that aggregate, search, or expose personal data about individuals using public or leaked sources."

"Restricted businesses that require closer review ... may not be accepted:"
> "Directories and boards;"
> "AI Content Generation tools (text, image, video, voice);"
> "Resume, hiring, or exam tools;"

"Job boards" is an outright prohibition. Pemby's resume tooling and AI generation would be restricted even without it. Getting approved would mean convincing Polar that Pemby is an "AI resume tool" and not a job board, but the job feed is the headline feature. This is the strictest of the four for Pemby.

Also relevant: "Polar reserves the right to add to it at any time, combined with placing your account under further review or suspending it in case we consider the usage deceptive, fraudulent, high-risk, or of low quality for consumers with high refund or chargeback risks."

### One-time payments for time-limited access: not native
> "A product is either a one-time purchase or recurring. One-time products charge the customer once and grant access forever."

Benefits page:
> "✅ Customers who bought a product with the benefit (lifetime access)"

Polar's automated benefits for one-time products are lifetime. A 1-, 3- or 6-month pass would need either:
- expiry enforced in Pemby's own app, contradicting the "access forever" model Polar reviewers look at; or
- a recurring product billed every 1, 3 or 6 months ("interval count ... 'every 3 months'"), which is auto-renew and conflicts with Pemby's no-auto-renew promise.

Whether a custom benefit can expire is **UNVERIFIED**.

### Refund window
Polar mandates no window. But:
> "Polar reserves the right to issue refunds within 60 days of purchase, at its own discretion, in order to prevent chargebacks ... This applies even if you have a "no refunds" policy"

Other thresholds: the account must stay at a "0.4% chargeback rate", and Polar expects support replies within "48 hours".

### Account review requirements
- "have a live website pointing to it"
- "Submit for approval. Tell us about your business, your products, and how you intend to use Polar."
- "Identity verification (KYC)" via Stripe Identity
- Payout account via Stripe Connect Express
- Initial review "up to 14 days"
- Polar asks for "a 100% discount code by email" or "a video recording that clearly shows the complete flow from an unpaid user to a paid user, including how the product is automatically accessible after purchase"
- Social media profiles are requested

The first-party pages I read contain no explicit checklist of legal pages (terms, privacy, refund). **UNVERIFIED** beyond "live website".

---

## 4. Dodo Payments

**Sources**
- Merchant Acceptance Policy: https://docs.dodopayments.com/miscellaneous/merchant-acceptance
- Verification process: https://docs.dodopayments.com/miscellaneous/verification-process
- Review & Monitoring Policy: https://docs.dodopayments.com/miscellaneous/review-monitoring-policy
- Terms of use: https://dodopayments.com/legal/terms-of-use

### Verdict: Restricted (review required), the most plausible fit of the four

"Businesses We Can't Support" (32 items) does **not** list job boards, recruitment or employment services. Under "Businesses We Might Support / Categories That Often Require Review":
> "1. AI Content Generation tools (text, image, video, voice) – No impersonation, scraping, or deepfakes"
> "3. Resume, hiring, or exam tools – No impersonation or cheating functionality"

Review may involve "extra details (like disclaimers, demo access, or policy links) before approving your account."

Prohibited items that could be misread onto Pemby:
> "2. Manual Digital Services – ... if the majority of the value sits in the human labour rather than digital systems, it will not be accepted."

Pemby is fully automated, so this does not apply.

> "3. Digital products with limited or unclear value – ... This also includes placeholder or pre-launch offerings such as holding pages, teaser sites, waitlists, or "coming soon" products that do not provide immediate, usable value after purchase."

> "13. Miracle, Misleading, or Unverifiable Claims – No products making exaggerated or unverifiable claims – e.g., ... "make money while you sleep.""

This is the clause a "get hired fast" claim would breach.

> "22. Privacy Violations & Surveillance Tech – ... tools that scrape or collect personal data without a clear legal basis."
> "25. Spam, mass outreach or scraping tools – Data privacy violations, including lead scraping, mass outreach or spam tools, and sensitive private information databases."

Pemby aggregates public *job postings*, not personal data. Describe it as "public company career pages / ATS job feeds", never "scraping".

> "30. Marketplaces, resale model – If you're selling on behalf of others, operating a multi-vendor platform, or taking funds and forwarding them elsewhere ... that's not supported"

Does not apply, since employers are not paid.

Delivery channels are checked too:
> "Where Dodo Payments fulfils that delivery, the standards in this policy apply both to what is sold on the storefront and to what is actually delivered through the channel."

This names Telegram. It matters only if Pemby uses Dodo's Telegram entitlement.

### One-time payments for time-limited access
The docs index lists a "One-time Payments Integration Guide" and checkout sessions "for both one-time purchases and subscriptions". Changelog v1.97.6 (May 7, 2026) mentions "Entitlements launch with five new fulfilment integrations (Discord, GitHub, Telegram, Framer, Notion)". I did not confirm whether a one-time entitlement can expire after N months. **UNVERIFIED**; plan to enforce expiry in Pemby's app.

### Refund window
Terms of use 9.6:
> "Dodo Payments will enable refunds 7 days from the date of purchase."

Terms 18.x let Dodo terminate "where the Product has a chargeback/ cancellation/ refund rate of more than 0.5% of total orders monthly". Terms 9.7 set a refund/chargeback fee "at minimum be 30 (thirty) GBP/ USD/ EUR or INR 3000". The 30-unit minimum is enormous next to a $5 pass: one chargeback costs six passes. How EU statutory withdrawal rights interact with the 7-day term is **UNVERIFIED**.

### Website requirements (verification-process page, verbatim)
> "Before you submit, check that a visitor with no account can reach your site and find each of the following:
> - Pricing — what you charge, including the billing interval for any recurring plan
> - Terms of Service — the agreement your customers accept when they buy
> - Privacy Policy — how you collect, store, and use customer data
> - Refund and Cancellation Policy — how a customer requests a refund or cancels a subscription
> - Contact route — a monitored support address or contact form your customers can use
>
> Link these from a consistent place, such as your site footer, so they are reachable from every page."

> "The details on your live site must match what you enter in the Product Information Form, including your product description, pricing, and delivery method."

Common hold reason: "a link that lands on a login screen, a closed waitlist, or a domain that is not live yet."

Reviews happen at "Activation & First Transaction", "Before First Payout", and on "Ongoing Triggers" such as "new domains, product shifts".

---

## Combined website checklist for pemby.app (union of all four)

1. Live over HTTPS with a public landing page. No login wall, waitlist, "coming soon", Cloudflare bot challenge or maintenance mode during review (Paddle, Creem, Dodo).
2. A clear product description saying what is delivered: a job-match feed on web, Telegram and email, plus AI CV, cover-letter and screening-answer drafting (Paddle, Creem, Dodo).
3. Key features and deliverables per pass (Paddle).
4. A public pricing page with $5 / 1 month, $10 / 3 months, $18 / 6 months, stating "one-time payment, no auto-renewal, access ends after N months" (all four).
5. Terms of Service naming the legal entity, the Moldovan SRL (Paddle requires the company name in the T&C).
6. Privacy Policy (all four).
7. A Refund Policy that meets the strictest MoR used: 14 days on Paddle, 7 days on Dodo, discretionary on Creem and Polar, with EU withdrawal rules respected. Link it from navigation or the footer on every page (Paddle, Dodo).
8. A contact route: a branded support email such as support@pemby.app that matches the MoR dashboard, on the site and in the dashboard (Creem, Dodo). Keep a published response time within 48 hours for Polar and 3 business days for Creem.
9. The site and the MoR application must match exactly on description, prices and delivery method (Dodo, Paddle).
10. Reviewer access: test credentials or a 100% discount code (Creem, Polar, Paddle).
11. No fake testimonials, invented user counts or logos of companies that never used Pemby (Creem, Dodo).
12. A short statement on the site that listings come from public employer career pages and that Pemby does not sell or share personal data (answers the Dodo #22/#25 and Polar OSINT concerns).

## Positioning: what to avoid saying

These phrases map onto specific clauses above.

| Avoid | Why | Say instead |
|---|---|---|
| "job board", "jobs board", "Pemby Jobs board" | Paddle prohibits job boards (as advertising), Polar prohibits them, Creem restricts them | "AI job-matching alerts", "personal job-search assistant" |
| "guaranteed job", "get hired in 30 days", "land your dream job", "we get you hired", "interviews guaranteed", "X% of users get offers" | Dodo #13 "Miracle, Misleading, or Unverifiable Claims"; Paddle and Polar "deceptive, unfair ... practices" and chargeback risk | "find relevant openings faster", "save time tailoring applications" |
| "recruiter", "recruitment agency", "placement", "we connect you with employers", "headhunter" | Suggests a regulated employment agency or human service (Paddle and Polar "Human services"; Creem "Services of any kind"; Creem 6.4.6 licensing) | "software", "tool", "you apply directly on the employer's site" |
| "career coach", "career services", "expert review of your CV" | Paddle "coaching"; Dodo #2 "Manual Digital Services"; Creem restricted services | "automated", "AI-generated drafts you review and edit" |
| "we apply for you", "auto-apply", "mass apply", "apply to 100 jobs in one click" | Dodo #25 "mass outreach"; Polar "automated outreach"; Paddle "Automated Social Media / Mass Marketing" | "you submit each application yourself" |
| "we write your CV for you", "ghostwritten", "beat the ATS", "trick recruiters", "undetectable AI" | Paddle "ghostwriting services"; Dodo "No impersonation or cheating functionality"; Creem "Homework/essay mills" | "AI helps you tailor your own CV to each role" |
| "scrape", "scraper", "crawl LinkedIn", "hidden jobs we scrape" | Dodo #22 and #25; Paddle "unauthorized access to data"; Polar OSINT and "circumvent ... terms of other services" | "aggregated from public company career pages / ATS job boards" |
| "candidate scoring", "rank applicants", "screen candidates" | Paddle "Automated decision-making or categorization of people" | "ranks jobs for you" |
| "lifetime", "unlimited forever" | Contradicts the time-limited pass and invites refund disputes | "access for 1 / 3 / 6 months" |
| "subscribe" / "subscription" for the pass | Buyers expect a cancel flow and renewal; Paddle and Creem apply subscription rules | "one-time pass", "no auto-renewal" |
| Paying per result, e.g. "pay only when you get an interview", or refund promises tied to getting hired | None of the four has a named "pay for chance of outcome" clause, but it reads as an outcome guarantee and chargeback bait | Flat price for time-limited software access |

## Unconfirmed items

- Whether Paddle and Creem reviewers would classify a paid job-seeker alert product as a "job board". This can only be settled by a pre-sales query or an actual review.
- Whether Paddle's checkout captures the EU digital-content withdrawal waiver (Refund Policy 2.2.4) for SaaS access.
- Whether Dodo or Creem support expiring one-time entitlements natively. Polar's docs say one-time purchases grant lifetime benefits.
- How Dodo's 7-day refund term interacts with the EU 14-day withdrawal right.
- Whether the policies accept a Moldovan seller entity was not checked. Paddle, Dodo and Polar publish country lists that this report did not read.
