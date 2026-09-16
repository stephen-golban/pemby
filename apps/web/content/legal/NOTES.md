# Legal and pricing content notes

Drafted 2026-09-16 by work order B1, phase 03. Nobody with legal training has reviewed these pages. The owner should get a lawyer's read before public launch.

Files:

- `apps/web/content/legal/en/terms.md`
- `apps/web/content/legal/en/privacy.md`
- `apps/web/content/legal/en/refunds.md`
- `apps/web/content/pricing/en.md`

## A. Website requirements from research 14

Sources are the verbatim lists in `docs/research/14-mor-acceptable-use.md`. "Site" items depend on the rendering order, not on this content.

### Dodo Payments, verification-process page

| Requirement                                                                               | Where it is met                                                                                                                        | Status                                                                                 |
| ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Pricing, with billing interval for recurring plans                                        | `pricing/en.md` Passes, How passes work. No recurring plan exists, and the page says one-time payment, no auto-renew                   | Met                                                                                    |
| Terms of Service                                                                          | `terms.md`                                                                                                                             | Met                                                                                    |
| Privacy Policy, how data is collected, stored and used                                    | `privacy.md` sections 3, 4, 7, 10, 12                                                                                                  | Met                                                                                    |
| Refund and Cancellation Policy, how to request a refund or cancel                         | `refunds.md` sections 3 and 6                                                                                                          | Met                                                                                    |
| Contact route, a monitored support address                                                | hello@pemby.app in every file's Contact section and `pricing/en.md` Footer strip                                                       | Met in content. Footer link on every page is a site item                               |
| Reachable by a visitor with no account, linked from a consistent place such as the footer | Site item for the rendering order                                                                                                      | Missing in content, owned by the route order                                           |
| Live site matches the Product Information Form: description, pricing, delivery method     | Description in `terms.md` section 2 and `pricing/en.md` hero. Delivery by Telegram, email, web push                                    | Owner must copy the same wording into the form                                         |
| No login screen, closed waitlist or non-live domain                                       | `pricing/en.md` Pass buttons note forbids waitlist and sign-in wall                                                                    | Met in content. Site item for the rest                                                 |
| No placeholder or "coming soon" offer without usable value, Dodo prohibited item 3        | `cta.notOpen` and `cta.notOpenDetail` say passes cannot be bought on the site yet and nobody is charged, with no launch promise        | Partial. Passes cannot be bought yet, and the free product is not built. See section D |
| No misleading or unverifiable claims, Dodo item 13                                        | `terms.md` section 3, `pricing/en.md` guarantee.scope and faq.outcome                                                                  | Met                                                                                    |
| No scraping or personal data collection without a legal basis, Dodo items 22 and 25       | `privacy.md` section 4 legal bases. Job source described as public career pages in `pricing/en.md` faq.source and `terms.md` section 2 | Met                                                                                    |
| Resume tools, no impersonation or cheating                                                | `terms.md` section 13, no false claims in kits. Kits described as drafts you edit                                                      | Met                                                                                    |

### Paddle, domain review page

| Requirement                                                                                       | Where it is met                                                                                                                                                                             | Status                                          |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Clear description of the product                                                                  | `terms.md` sections 2 and 3, `pricing/en.md` hero and whatItIs                                                                                                                              | Met                                             |
| Pricing details or a pricing page                                                                 | `pricing/en.md`                                                                                                                                                                             | Met                                             |
| Key features or deliverables included with the purchase                                           | `pricing/en.md` Free vs Pass table and passes.includes, `terms.md` section 7                                                                                                                | Met                                             |
| Terms, Refund Policy and Privacy Policy accessible via navigation                                 | Content exists. Navigation links are a site item                                                                                                                                            | Missing in content, owned by the route order    |
| Company name in the Terms                                                                         | `terms.md` section 1 names "SYNCRA" S.R.L. with its IDNO                                                                                                                                    | Met                                             |
| Live and on HTTPS                                                                                 | Site item                                                                                                                                                                                   | Not content                                     |
| Custom or enterprise pricing sheet, if applicable                                                 | Not applicable                                                                                                                                                                              | n/a                                             |
| Not a job board, Paddle prohibits "Advertising Services, including but not limited to job boards" | No banned wording in any file. `terms.md` section 3 and `pricing/en.md` whatItIs say employers do not pay and Pemby is software                                                             | Met in wording. Classification is Paddle's call |
| No "human services" or coaching                                                                   | Every file describes automated software. No coaching wording                                                                                                                                | Met                                             |
| No "automated decision-making or categorization of people"                                        | `privacy.md` section 5 says Pemby ranks jobs for you and does not rank people for employers                                                                                                 | Met                                             |
| No ghostwriting framing                                                                           | Kits are "drafts" the user reads, edits and sends, in `terms.md` sections 2 and 15, `pricing/en.md` faq.kit and the landing how-it-works kit step. No timing claim such as "about a minute" | Met                                             |
| 14-day refund, seller terms 10.2                                                                  | `refunds.md` section 2                                                                                                                                                                      | Met                                             |

### Research 14 combined checklist, items not covered above

| Item                                                                                                       | Status                                                                                                                                                                                |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 8. Branded support email matching the MoR dashboard                                                        | hello@pemby.app is used everywhere. Research 14 suggests support@pemby.app for Creem only. Owner must use hello@pemby.app in both applications, or tell the rendering order to switch |
| 8. Published response time                                                                                 | "We reply within 3 business days" in all three legal pages. Proposed commitment, owner to confirm                                                                                     |
| 10. Reviewer access, test credentials or 100% discount code                                                | Missing. Not content. Owner provides at application time                                                                                                                              |
| 11. No fake testimonials, user counts or logos                                                             | Met. No numbers about users, jobs or companies. The 3-month badge is "Recommended", not a popularity claim                                                                            |
| 12. Statement that listings come from public employer pages and Pemby does not sell or share personal data | Met. `pricing/en.md` faq.source and faq.privacy, `privacy.md` section 2                                                                                                               |

## B. Placeholders

Filled on 2026-09-16 by work order B2 with the owner's entity details. No `{{...}}` tokens remain in the markdown.

| Former token            | Value now in the files                                                                                                             | Where                                                            |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `{{ENTITY_LEGAL_NAME}}` | `Societatea cu Răspundere Limitată "SYNCRA" ("SYNCRA" S.R.L.)` on first mention, `"SYNCRA" S.R.L.` after, trading as Syncra Studio | `terms.md` section 1, `privacy.md` section 1, `refunds.md` intro |
| `{{ENTITY_IDNO}}`       | `1025605006423`                                                                                                                    | `terms.md` section 1, `privacy.md` section 1                     |
| `{{ENTITY_ADDRESS}}`    | "Registered in: Chișinău, Republic of Moldova". The owner forbids publishing the street address                                    | `terms.md` section 1, `privacy.md` section 1, `refunds.md` intro |
| `{{ENTITY_DIRECTOR}}`   | `Stephen (Ștefan) Golban, administrator`                                                                                           | `terms.md` section 1, `privacy.md` section 1                     |
| `{{EFFECTIVE_DATE}}`    | Removed from the markdown. The pages render it from `EFFECTIVE_DATE` in `apps/web/content/legal/meta.ts` (16 September 2026)       | Top of `/terms`, `/privacy`, `/refunds`                          |
| `{duration}`            | `cta.buy` in `apps/web/messages/en/pricing.json`, an ICU message argument, not an owner fact                                       | Unused until checkout opens                                      |

## C. Legal facts: verified and UNVERIFIED

Verified against primary sources on 2026-09-16:

- GDPR article titles for Articles 3, 6, 8, 12, 15 to 18, 20, 21, 27, 28, 44 to 46 and 77, and the one-month answer period in Article 12(3) extendable by two further months. Source: EUR-Lex, CELEX 32016R0679.
- Consumer Rights Directive 2011/83/EU, consolidated text: Article 9(1) gives a 14-day withdrawal period. Article 16(a) removes it for a service only after full performance, and only with prior express consent and acknowledgement. Article 14(3) makes a consumer who asked for performance during the withdrawal period pay a proportionate amount. Source: EUR-Lex, CELEX 02011L0083-20220528.
- Moldova Law No. 195 of 25.07.2024 on personal data protection, published 23.08.2024, in force 24 months after publication under Article 89(1), so from 23.08.2026. It repeals Law No. 133/2011, Article 90(3). The authority is the National Centre for Personal Data Protection. Article 72 gives the right to complain to it. Article 8 sets 14 years as the age for a child's own consent to information society services. Source: English translation on datepersonale.md, which is not the official text.

UNVERIFIED:

- UNVERIFIED: the retention period for accounting documents in Moldova. Law No. 287/2017 Article 17 says documents are kept "according to the rules and terms" of the state archival authority, and no number was found. `privacy.md` section 12 says "as long as Moldovan accounting and tax law requires". Settle with the accountant, who should name the archival order and the period for primary documents, payment reports and the tax limitation period.
- UNVERIFIED: whether Pemby needs an EU representative under GDPR Article 27. Pemby offers a service to people in the EU and its processing is not occasional, so the Article 27(2)(a) exemption probably does not apply. No representative is named. Settle with a lawyer, then add the representative's details to `privacy.md` section 1.
- UNVERIFIED: that the merchant of record acts as a separate controller for payment data, as `privacy.md` section 10 says. Settle by reading the approved provider's data processing terms.
- `privacy.md` section 10 names Dodo Payments or Paddle as merchant of record, per the owner on 2026-09-16. Once one provider is approved, name only that one.
- UNVERIFIED: transfer safeguards. `privacy.md` section 11 says we rely on safeguards "such as standard contractual clauses". Nobody has checked that Railway, Cloudflare, OpenRouter, Resend and Telegram offer SCCs or equivalent terms, or which Moldovan transfer mechanism under Law 195/2024 Articles 44 to 49 applies. Settle by collecting each provider's DPA.
- UNVERIFIED: Railway data location. The region of the Railway Postgres and bucket was not checked. Settle in the Railway dashboard and consider naming it in `privacy.md` section 10.
- UNVERIFIED: backups are deleted within 30 days, `privacy.md` section 12. Depends on Railway Postgres backup settings. Settle in the Railway dashboard, or change the number.
- UNVERIFIED: Resend region eu-west-1 is from `docs/SETUP.md`, as reported by the owner. Not checked in Resend.
- Removed: the claim that the operating SRL is a Moldova IT Park resident. It was unverified, so no page makes it. Add it back only once the owner confirms residency.
- UNVERIFIED: minimum age. `terms.md` section 4 and `privacy.md` section 16 set 16. That covers the GDPR default in Article 8 and Moldova's 14. EU member states set their own age between 13 and 16. Contract capacity for buying a pass was not checked for any country. Lawyer to confirm.
- UNVERIFIED: governing law and courts, `terms.md` section 23. The rule that consumers keep the mandatory protection of their home country's law is stated without an article number. Lawyer to confirm, including EU rules on consumer contracts with a non-EU trader.
- UNVERIFIED: the liability cap and exclusions in `terms.md` section 20. Whether they hold for consumers in Moldova and the EU was not checked.
- UNVERIFIED: whether Cloudflare Turnstile sets cookies or local storage that need consent in the EU. `privacy.md` section 15 lists it as necessary and says there is no cookie banner. Settle from Cloudflare's Turnstile privacy documentation and a lawyer's view on the ePrivacy rules.
- UNVERIFIED: push service vendors named in `privacy.md` section 9. Google, Mozilla and Apple run the main browser push services. Not checked for every browser.

Proposed commitments that are not PLAN decisions. The owner should accept or change each one:

- Pass length: 1 month is 30 days, 3 months 90 days, 6 months 180 days, `terms.md` section 8 and `pricing/en.md`.
- Guarantee details: paused days do not count, and "Not for me" matches still count as matches, `terms.md` section 9.
- While a pass is paused the account works like the free tier, `terms.md` section 10.
- Refund removes guarantee days earned by that pass, only that purchase's time on stacked passes, and chargebacks end the pass while the dispute is open, `refunds.md` sections 4 and 8.
- After 14 days, refunds only where law, the provider's terms or an unfixable fault on our side require it, `refunds.md` section 5.
- Refund includes tax charged at checkout, `refunds.md` section 2. The merchant of record decides this in practice.
- 30 days' notice and a pro-rata refund if Pemby shuts down, `terms.md` section 19.
- 14 days' notice for term changes, and changes never make an existing pass worse, `terms.md` section 22.
- Kit fair use on unlimited passes, `terms.md` section 13.
- Security logs kept 30 days, emails to hello@pemby.app kept 2 years, "Other" flag notes removed after review, `privacy.md` section 12.
- Account deletion is immediate in the live database and file storage, `privacy.md` section 12. Phases 06, 08, 09, 10 and 12 must build it that way.
- Export contents listed in `privacy.md` section 13.
- "We reply within 3 business days" in all three legal pages.

## D. Conflicts and limits found while drafting

- **Dodo's 7-day window and EU withdrawal.** D14 and phase 10 item 7 will set the Refund Policy to 7 days if Dodo is the provider. Under Directive 2011/83/EU Article 16(a), an EU consumer loses the 14-day withdrawal right for a service only after the service is fully performed. A 30-day pass is not fully performed after 7 days, so an EU buyer may still withdraw within 14 days and pay a proportionate amount under Article 14(3). A published 7-day window could contradict that. Since the merchant of record is the seller, its buyer terms decide the legal position. Recommendation: keep 14 days on the public page even on Dodo, and check with Dodo how it handles EU withdrawal. `refunds.md` section 7 already says statutory rights apply in addition.
- **Pricing before anything works.** Phase 03 publishes pricing while the CV drop, matching and delivery do not exist yet. The pages describe the planned product in the present tense. Dodo prohibited item 3 covers "pre-launch offerings" and "coming soon" products. The legal pages cannot fix this. The owner should apply once the free product runs, or describe the state honestly in the application.
- **PRODUCT.md and D20 still list GitHub, Google and magic link sign-in, and Sentry and PostHog.** The amended D20 and `docs/SETUP.md` say they are deferred. The pages follow SETUP.md. When any of them goes live, `privacy.md` sections 3, 10 and 15 need an update before launch, and PostHog would likely need a consent banner.
- **Features not built yet but described.** Referrals, the referral cookie, the OpenRouter connection, tracker outcome evidence and kits are in the pages because the order asked for them. Referrals carry "when available" wording. The rest do not.
- **Chrome extension removed.** On 2026-09-16 the owner removed the extension from `terms.md` section 7, the pricing table and the landing passes teaser until it ships. `terms.md` section 7 keeps one neutral line that features may be added later. Add the extension back to all three when it is released.
- **Phase 12 GitHub issue digest.** Anonymized flag patterns will go to public GitHub issues and a Claude Code GitHub Action. Not live, so not listed. `privacy.md` sections 8 and 10 need an update before phase 12 ships.
- **Research 14 suggests support@pemby.app.** The order and phase 03 use hello@pemby.app. Only Creem asks for a branded support address, and hello@pemby.app is branded. No change made.
- **D16 and "place".** The order allows one negative statement about placing candidates. It appears once, in `pricing/en.md` whatItIs.body. `terms.md` section 3 says the same thing without the word.
