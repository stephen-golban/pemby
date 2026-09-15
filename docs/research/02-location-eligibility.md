# 02 — Location eligibility for remote developer jobs

Research date: 2026-09-15. Written for Pemby, a job-search app for developers and IT people. The reference user is a senior developer (7 years) who holds only Moldovan citizenship. Moldova is outside the EU, is an EU candidate country, and is not the US.

## How to read this document

- Every claim links to its source. Tags mark how much weight a claim can bear:
  - **[primary]**: the organization that owns the fact, such as a law, regulator, official API docs, a company handbook, a provider's own pricing page, or an SEC-style earnings release.
  - **[first-hand]**: a named individual describing their own experience, mostly on Hacker News. These are anecdotes, not statistics.
  - **[secondary]**: a third-party write-up. It is used only where no primary source was reachable, and flagged.
  - **[inference]**: my own reasoning from the cited facts. It is not a sourced claim.
  - **[unverified]**: I could not confirm it. Treat it as a lead, not a fact.
- Limits of this pass. The web-search quota ran out partway through, and several pages blocked automated fetches (403): Multiplier, Papaya, Rippling, Proxify, Upwork, RemoteOK's API, We Work Remotely, and Remote's Wise help page. Those gaps are listed in "What was not verified" at the end.
- Nothing here is legal or tax advice. Moldova's tax rules changed on 2026-01-01. Confirm with a Moldovan accountant before acting.

---

## TL;DR

1. Restrictions to "US-only" or "EU-only" mostly come from **employment**: payroll registration, social security, mandatory local labour law, permanent-establishment (PE) risk, and EOR cost. Most of those drop away when the worker is a **B2B contractor** with a real business. What still applies to contractors is sanctions, export controls, data-transfer rules (GDPR), timezone, misclassification risk, and trust or enforceability.
2. For a Moldovan developer, the clean legal route is a **Moldovan business invoicing the foreign company**. That means an individual entrepreneur or SRL registered with **Moldova IT Park** at a 7% turnover tax, or the new 2026 **independent-entrepreneur regime** at 15% up to 1.2M MDL. Moldova is not under US comprehensive sanctions. Deel and Remote both support Moldova for EOR, at about **$599–$699/month**, and for contractors, at **$29–$49/month**.
3. Middle-man margins are poorly disclosed. The evidence points to **roughly a 30–50% spread** at talent marketplaces and a **~29% company-wide gross margin** at EPAM. Anecdotes from low-end body shops describe far larger spreads.
4. **No major ATS (applicant tracking system) exposes a structured "countries we can hire from" field.** Greenhouse has only a free-text location. Lever, Ashby, Workable, and SmartRecruiters expose a country plus a remote flag, but that country describes where the job sits, not where a hire may live. schema.org `applicantLocationRequirements` is the only standard field built for this, and Google falls back to the `jobLocation` country when it is missing.
5. Existing "worldwide" boards rely on employer-typed labels. They treat missing data as "open to all", conflate timezone limits with legal limits, and ignore the difference between contractor and employee. Pemby can do better by modeling **company-level evidence** and **(country × engagement type)** eligibility.

---

## 1. Why "remote" jobs get restricted by country

### 1.1 Reasons, and whether they apply to a contractor

| Reason | Mechanism | Employee | B2B contractor |
|---|---|---|---|
| Payroll and social security registration | The employer must run local payroll, withhold income tax, and pay social contributions in the worker's country, or use an EOR | Yes | No. The contractor pays their own taxes, unless reclassified |
| Mandatory employment law | A choice-of-law clause cannot strip the protections of the country where the employee habitually works | Yes | Only if reclassified as an employee |
| Misclassification | A "contractor" who is in fact an employee can be reclassified under local law | n/a | **Yes. This is the main contractor-specific risk** |
| Permanent establishment (corporate tax nexus) | A home office or dependent agent can create taxable presence for the company | Yes | Low for an independent developer [inference] |
| Home-country withholding (US) | Pay for services performed outside the US is foreign-source income | No US withholding | No US withholding |
| Sanctions | Paying persons in embargoed jurisdictions is prohibited | Yes | Yes |
| Export controls | Releasing controlled technology or source code to a foreign person is an export | Yes | Yes |
| Data protection (GDPR) | Making EU personal data available to a separate importer in a non-adequate country is a "transfer" | Usually not a transfer | Likely a transfer [inference] |
| Timezone | Meeting overlap | Yes | Yes |
| EOR cost and scale | $599–$699/month per head, economical only at scale | Yes | Contractor tools cost $29–$49/month |
| IP enforcement and litigation reach | The company cannot easily sue in some jurisdictions | Yes | Yes |
| Fraud and identity risk | Concern about fake remote workers | Yes | Yes |

### 1.2 Evidence for each reason

**Payroll and entity requirements.** Remote states that companies hiring employees in Moldova "are typically required to either own a local legal entity or work with a global employment platform like Remote" [primary] (https://remote.com/country-explorer/moldova). Deel estimates Moldovan employer cost at "24.60% of the employee salary", with 24% social security, and cites a flat 12% employee income tax [primary] (https://www.deel.com/hiring/employees/moldova/). An HN commenter in a 2022 thread named social security as "the single worst blocker… the setup is different for each country" [first-hand] (https://news.ycombinator.com/item?id=33996871, user wongarsu). The same pattern exists within the US: a 2026 HN thread notes that companies must register for employment tax in each state where they employ someone [first-hand] (https://news.ycombinator.com/item?id=49170764, comment 49170883).

**Mandatory employment law.** EU Rome I Regulation, Art. 8(1): a chosen law "may not… have the result of depriving the employee of the protection afforded to him by provisions that cannot be derogated from" under the law of the place where the employee "habitually carries out his work" (Art. 8(2)) [primary] (https://www.legislation.gov.uk/eur/2008/593/article/8, the retained UK copy of Regulation (EC) 593/2008; the EU text is the same). Moldova is not bound by Rome I, but its Labour Code imposes local terms. Remote lists up to three months' probation, two months' notice for financial-reason dismissals, 28 days' annual leave, and 13 public holidays [primary] (https://remote.com/country-explorer/moldova).

**Misclassification (the contractor-specific risk).** "It is illegal to hire a person as a contractor when they are de facto an employee in many countries" [first-hand] (https://news.ycombinator.com/item?id=33996871, user shafyy). PostHog's handbook: "In some of these countries we *may* consider hiring as a contractor, provided there is no misclassification risk" [primary] (https://github.com/PostHog/posthog.com/blob/master/contents/handbook/people/hiring-process/index.mdx). Deel's Contractor of Record product exists to absorb this risk ("we take on liability") [primary] (https://www.deel.com/contractor-of-record/). Remote sells "Contractor Management Plus" at $99/month, which includes indemnity [primary] (https://remote.com/pricing).

**Permanent establishment.** On 2025-11-19 the OECD updated the Model Tax Convention Commentary on home offices. A cross-border home office generally is not a fixed-place PE if used for "less than 50 percent of their total working time" over 12 months. Above that, the test is whether there is a "commercial reason", for example "facilitating business with local customers or suppliers" [secondary, Big-4 summary of the primary] (https://kpmg.com/xx/en/our-insights/eu-tax/navigating-permanent-establishment-risk-in-a-remote-work-era-1.html; date per https://www.blg.com/en/insights/2026/03/permanent-establishment-and-remote-work-oecds-2025-update-and-your-organization). Some countries, India for example, have reservations about the new tests (BLG, same link). [inference] A developer who writes code for a foreign company's own product, with no local customers, has a weak "commercial reason" case, so PE risk is low even for employees. It is lower still for an independent contractor who has their own business and serves multiple clients. Dependent-agent PE is aimed at people who habitually conclude contracts, which developers rarely do.

**US tax on foreign contractors.** IRS Publication 515: "Services performed outside the United States are foreign source income and are not subject to chapter 3 withholding" [primary] (https://www.irs.gov/publications/p515). US companies commonly collect Form W-8BEN to document foreign status (https://www.irs.gov/forms-pubs/about-form-w-8-ben) [primary for the form; the "commonly" is practice, unverified]. US tax is not what blocks hiring a Moldovan contractor.

**Sanctions.** OFAC has no Moldova sanctions program [primary] (https://ofac.treasury.gov/sanctions-programs-and-country-information). The broad embargoes are Cuba, Iran, and North Korea, plus the Crimea and so-called DNR/LNR regions of Ukraine under E.O. 13685/14065. The program page is https://ofac.treasury.gov/sanctions-programs-and-country-information/ukraine-russia-related-sanctions; I did not extract the embargo text itself [unverified detail]. The Syria program was removed: E.O. 14312 "removes U.S. sanctions on Syria, effective July 1, 2025" [primary] (https://ofac.treasury.gov/recent-actions/20250630). PostHog's handbook still says "Due to US sanctions, we can't hire folks in Cuba, Iran, North Korea, or Syria" [primary] (https://github.com/PostHog/posthog.com/blob/master/contents/handbook/people/hiring-process/index.mdx). **Company policy pages go stale, and Pemby should date-stamp them.**

**Export controls (US EAR).** "Any release in the United States of 'technology' or source code to a foreign person is a deemed export to the foreign person's most recent country of citizenship or permanent residency" (15 CFR 734.13(b)) [primary] (https://www.law.cornell.edu/cfr/text/15/734.13). In the EAR country groups, **Moldova, Georgia, and Armenia sit in D:1 (national security) and D:2 (nuclear)**. Ukraine and Serbia sit in A/B groups [primary, as read from the table] (https://www.law.cornell.edu/cfr/text/15/appendix-Supplement_No_1_to_part_740). Published information and software are "not subject to the EAR" (15 CFR 734.3(b)(3)) [primary] (https://www.law.cornell.edu/cfr/text/15/734.3). [inference] For ordinary web or SaaS work this rarely matters. For semiconductors, defense, aerospace, advanced cryptography, or US-government work, a D:1 citizenship can be a real blocker. It applies to contractors and employees alike.

**Data protection (GDPR).** No non-EU country from this brief is on the EU adequacy list: Moldova, Ukraine, Georgia, Armenia, Serbia, and the rest of the Balkans are all absent. The list covers Andorra, Argentina, Brazil, Canada, Faroe Islands, Guernsey, Israel, Isle of Man, Japan, Jersey, New Zealand, Republic of Korea, Switzerland, UK, US (DPF), Uruguay, and the European Patent Organisation [primary] (https://commission.europa.eu/law/law-topic/data-protection/international-dimension-data-protection/adequacy-decisions_en). EDPB Guidelines 05/2021 define a transfer by three cumulative criteria: the exporter is subject to GDPR; it makes data available "to another controller, joint controller or processor ('importer')"; and the importer is in a third country. Example 8: an **employee** remotely accessing company data from abroad "does not qualify as a transfer… since George is not another controller, but an employee". Example 11: a third-country **processor** remotely accessing EU data "results in transfers" [primary] (https://www.edpb.europa.eu/our-work-tools/our-documents/guidelines/guidelines-052021-interplay-between-application-article-3_en, PDF v2.0). [inference, uncertain] A Moldovan contractor operating as their own company is plausibly a separate processor, so an EU client would need Standard Contractual Clauses or similar. An individual acting "under the authority" of the controller might be analyzed differently. This adds friction for EU clients hiring contractors and does not apply to EOR employees.

**Timezone.** Moldova is UTC+2, and UTC+3 in summer [secondary] (https://en.wikipedia.org/wiki/Time_in_Moldova). That is 7 hours ahead of US Eastern and 10 hours ahead of US Pacific in both seasons [inference, arithmetic]. PostHog's rule is explicit: "Our hiring is strictly limited to candidates physically based in GMT+2 through GMT-8", with an exception for countries "normally GMT+2 but move to GMT+3 during daylight savings" [primary] (https://github.com/PostHog/posthog.com/blob/master/contents/handbook/people/hiring-process/index.mdx). Moldova falls inside that band only because of the exception.

**EOR cost and scale.** Deel EOR costs $599/month [primary] (https://www.deel.com/pricing). Remote costs $699/month [primary] (https://remote.com/pricing). Oyster costs $699/month [primary] (https://www.oysterhr.com/pricing). One HN commenter said $599 is only economical "when you get to a good 15-20 people in a specific country" [first-hand] (https://news.ycombinator.com/item?id=33996871, user chadk). PostHog avoids EOR in France, Italy, Sweden, and others "mainly due to the very high employer costs" [primary] (PostHog link above).

**Enforceability, IP, geopolitics.** From the HN thread "Why are 'remote' jobs in late 2025 still limited to hiring in US/CA/UK/DE?" (2025-12-10) [first-hand] (https://news.ycombinator.com/item?id=46213671):
- "They will be adverse to sharing their IP with anyone not within a jurisdiction that would honor contracts outlining IP rights" (drewsski, https://news.ycombinator.com/item?id=46260430).
- "Countries where we don't hire for geopolitical reasons… staff there can complicate seeking funding including loans" (hodgesrm, https://news.ycombinator.com/item?id=46259275).
- "It's not a good idea to do business with any party that would be impractical to sue if need be" (tacostakohashi, https://news.ycombinator.com/item?id=46225956).
- "Easiest approach is to establish yourself as a company/self employed" (general1465, https://news.ycombinator.com/item?id=46217192).

**Fraud.** Remote-worker identity fraud tied to North Korean IT-worker schemes is a live hiring concern. Criminal sentences were reported in 2026 [secondary, unverified against DOJ] (https://www.hiretofu.com/blog/ofac-hiring-compliance-deepfake-detection-sanctions-fraud). [inference] This pushes companies toward identity and location verification, which helps legitimate Moldovan applicants who can prove residence.

**Real policy examples:**
- GitLab: "We are not currently hiring in locations that do not have an entity or PEO." It names entity countries: Australia, Belgium, Canada, Finland, France, Germany, India, Ireland, Israel, Japan, Netherlands, New Zealand, Singapore, South Korea, Spain, UK, and US. Some of these carry role limits [primary] (https://gitlab.com/gitlab-com/content-sites/handbook/-/raw/main/content/handbook/people-group/employment-solutions.md).
- Automattic: "1,421 Automatticians in 83 countries"; "Work with us from wherever you like" [primary] (https://automattic.com/work-with-us/).

---

## 2. Legal routes for a developer in Moldova (and nearby countries)

### 2.1 Moldovan business structures

Note on terms: "PFA" (persoană fizică autorizată) is the **Romanian** sole-trader form. Moldova's equivalents are the **individual entrepreneur / întreprindere individuală (ÎI)** and the SRL (LLC) [inference from the sources below, which use "individual entrepreneur", "ÎI", and "SRL"].

| Route | Tax | Key conditions | Sources |
|---|---|---|---|
| **Moldova IT Park (MITP) resident**, as SRL or individual entrepreneur | **7% of monthly sales revenue**, or a per-employee minimum if higher | Law 77/2016. Replaces CIT (12%), PIT (12%), employer social (24%), health (9%), local, road, and real-estate taxes. **VAT, withholding, and excise are not covered.** Minimum is 30% of the government's projected average monthly salary per employee, ~5,220 MDL/employee/month in 2026. Monthly form IU17 due by the 25th. Resident contracts can run to 2037-12-31 | [primary] https://mitp.md/why-mitp/about-7-single-tax/ |
| | | Eligible IT activities must be ≥70% of revenue | [secondary, search snippet only, unverified] https://fmd.md/eng/blog/how-to-join-moldova-it-park-requirements |
| | | A secondary source says the regime is state-guaranteed to 2035-12-31, which differs from MITP's 2037 contract term. Flagged | [secondary] https://incorpore.md/en/blog/moldova-7-percent-corporate-tax/ |
| **Independent entrepreneur regime** (new 2026-01-01) | **15%** of income up to **1,200,000 MDL/year**; **35%** above | Fiscal Code Chapter 10⁴, Law 228/2025. One tax replaces income tax, social and medical contributions, and local taxes. No bookkeeping. Cash register only when taking cash. Income is monitored through bank accounts | [primary] https://mf.gov.md/en/node/133853 |
| | | Includes CAEM 62.01 (custom software), 62.02 (IT consulting), 63.1. No employees allowed. Requires a dedicated bank account | [secondary] https://ducont.md/en/blog/article/freelancer/ ; https://fmd.md/blog/regim-fiscal-simplificat-pentru-freelanceri-in-moldova-din-2026 |
| **Standard individual entrepreneur** | 12% on taxable income | Standard PIT rules | [secondary, Big-4] https://taxsummaries.pwc.com/moldova/individual/taxes-on-personal-income |

[inference] On 1,000,000 MDL of export revenue, IT Park costs ~70,000 MDL (7%) and the freelancer regime costs 150,000 MDL (15%), before IT Park's accounting costs. For a senior developer billing foreign clients, IT Park is usually cheaper. The freelancer regime is simpler. **Uncertain:** how the IT Park minimum and social-insurance coverage work for a single-person ÎI with no employees. Ask MITP or an accountant.

**Currency and payments regulation.** On 2025-04-29 Moldova's government approved rules for "simplified and faster access" to platforms such as Stripe, PayPal, and Revolut, and "more flexible rules for repatriating foreign currency amounts of up to 100,000 lei" [primary] (https://consecon.gov.md/en/2025/04/29/moldovan-businesses-to-gain-easier-access-to-stripe-paypal-and-revolut-government-removes-barriers-to-international-payments-and-ecommerce/). The exact National Bank of Moldova rules on residents holding foreign accounts were **not verified**.

### 2.2 Employer of Record (EOR) and contractor platforms, checked for Moldova

| Provider | Moldova EOR | Moldova contractors | Price (list) | Source |
|---|---|---|---|---|
| **Deel** | Yes; "as little as 2 days" | Contractor product covers 150+ countries per Deel. The Moldova contractor page rendered as an empty template. Moldova not verified | EOR **$599/mo**; contractor **$49/mo**; Contractor of Record **$325/mo**; plus a one-off $80 agreement fee and 0.60% admin-liability cost in its Moldova calculator | [primary] https://www.deel.com/hiring/employees/moldova/ ; https://www.deel.com/pricing |
| **Remote** | Yes | Yes | EOR **$699/mo**; Contractor Management **$29/mo**; Contractor Management Plus **$99/mo** | [primary] https://remote.com/country-explorer/moldova ; https://remote.com/pricing |
| **Oyster** | Listed as a Moldova provider by a comparison site. Not verified on Oyster's site | Not verified | EOR $699/mo; contractors $29/mo; "120+ countries" | [primary for price] https://www.oysterhr.com/pricing ; [secondary for Moldova] https://www.teamed.global/compare/best-eor-in-moldova |
| **Multiplier** | Not verified (403) | Not verified | Not verified | https://www.usemultiplier.com/moldova (blocked) |
| **Papaya Global** | Not verified (403) | Not verified | Not verified | https://www.papayaglobal.com/countrypedia/country/moldova/ (blocked) |
| **Rippling** | Doubtful: a secondary source says EOR covers ~32 countries | Contractors in 185+ countries per the same source | Not verified | [secondary] https://www.remofirst.com/post/rippling-vs-papaya-global |

Data conflict: Remote's Moldova page shows "Employer social security: 0% – 32%" and "Personal income tax: 0%" (https://remote.com/country-explorer/moldova). Deel (24% social, 12% PIT) and MITP (24% employer social, 9% health, 12% PIT) disagree. Remote's figures look like a generic range or a bad template. Trust Deel and MITP.

Minimum wage: 6,300 MDL/month from January 2026 [primary, Remote] (https://remote.com/country-explorer/moldova).

[inference] For the founder, the EOR route makes the company pay $7–8.4k/year in fees plus ~24% employer social cost on the salary. A B2B contract through IT Park costs the company about $350–590/year in contractor-platform fees, or nothing if paid by direct invoice. That gap is why contractor-open companies are the realistic target.

### 2.3 Payment rails

| Rail | Moldova status | Source |
|---|---|---|
| SWIFT wire to a Moldovan bank (USD/EUR) | Works; Wise lists SWIFT codes for Moldovan banks such as Moldindconbank | [primary] https://wise.com/us/swift-codes/countries/moldova/moldindconbank |
| **Stripe** (accept payments or Connect payouts) | **Moldova not on Stripe's supported-country list**, nor Ukraine, Georgia, Armenia, Serbia, North Macedonia, Albania, or Bosnia. A secondary summary claimed otherwise; the primary page wins | [primary] https://stripe.com/global |
| PayPal | Available in Moldova. Receive and withdraw features **not verified**; the country page did not render | [primary, partial] https://www.paypal.com/md/webapps/mpp/country-worldwide ; [secondary] https://www.moldova.org/en/paypal-now-available-in-moldova/ |
| Wise | Accounts reportedly open to Moldova residents; the Wise card reportedly is not | [secondary, unverified] https://www.alexontrading.com/faq/availability/ewallets/transferwise-moldova |
| Payoneer | Reported to accept Moldovan SRLs and pay out to local banks in MDL/EUR/USD | [secondary, unverified] https://incorpore.md/en/blog/payment-processing-moldova-stripe-paypal/ |
| Crypto (e.g., USDC) | Not researched. Legal status, tax treatment, and currency-reporting duties in Moldova are **unverified**. Do not recommend it as a default B2B rail | — |

### 2.4 Nearby countries (short, partly verified)

| Country | Common contractor regime | Source |
|---|---|---|
| Ukraine | FOP "group 3" simplified single tax at 5%; standard PIT 18% plus a 1.5% military levy | [secondary, Big-4] https://taxsummaries.pwc.com/ukraine/individual/taxes-on-personal-income |
| Georgia | Small-business status: 1% of turnover under GEL 500,000; standard PIT 20% | [secondary, Big-4] https://taxsummaries.pwc.com/georgia/individual/taxes-on-personal-income |
| Armenia | Micro or turnover regime for IT sole traders **not verified** | https://taxsummaries.pwc.com/armenia/individual/taxes-on-personal-income |
| Serbia | Lump-sum ("paušal") regime and its independence test **not verified** | https://taxsummaries.pwc.com/serbia/individual/taxes-on-personal-income |
| LATAM, Africa, South Asia | Not researched in this pass. The same structure applies: a local business entity plus EOR or contractor platforms, but sanctions and Stripe coverage differ by country | — |

---

## 3. Middle-man margins: bill rate vs pay rate

Evidence here is thin and mostly anecdotal. No marketplace publishes its take rate.

| Firm type | Evidence | What it shows |
|---|---|---|
| **EPAM** (public, large Eastern European outsourcer) | FY2025 revenue $5.457B; cost of revenues excluding D&A $3.884B; ~56,600 delivery professionals; GAAP operating margin 9.5% [primary] (https://investors.epam.com/news/news-details/2026/EPAM-Reports-Results-for-Fourth-Quarter-and-Full-Year-2025/default.aspx) | Gross margin ≈ **28.8%**. Revenue per delivery professional ≈ **$96k/yr**; cost of revenue ≈ **$69k/yr** each, covering salary, benefits, bench, and subcontractors [inference, arithmetic on year-end headcount] |
| **Toptal** | Official FAQ: "Talent members set their own rates and Toptal does not take a cut from that" [primary] (https://www.toptal.com/freelance-jobs/faq). The client pays a separate, higher, blended rate | The "no cut" wording is technically about the talent's rate. The markup sits on the client side |
| Toptal, first-hand | "Toptal has more or less a 50% markup over what developer gets" (rushafi, 2015, https://news.ycombinator.com/item?id=10114857); "~50% markup over the developer cost" (abulman, 2015, https://news.ycombinator.com/item?id=10108610); "$30/hr with them getting $100/hr" (tluyben2, 2017, https://news.ycombinator.com/item?id=14845568; context ambiguous) [first-hand, old] | About 33–70% of the client rate retained |
| Toptal, 2026 | "On a $95/hr engagement, the developer typically receives $60–$65/hr" [secondary, a competitor's blog] (https://www.thefrontendcompany.com/posts/toptal-pricing) | ~32–37% retained. Treat as marketing |
| **Lemon.io** | Rate calculator shows senior developer rates of "$41–60/hour" and says nothing on markup [primary] (https://lemon.io/rate-calculator/). A secondary review says the markup is embedded in a single client price [secondary] (https://www.hireinsouth.com/post/lemon-io-pricing) | Take rate undisclosed |
| **Arc.dev** | Claims "saving up to 58% vs traditional hiring"; "$0 until you hire"; no rate disclosure [primary] (https://arc.dev/) | Undisclosed |
| Indian IT services, first-hand | "The u company is charged something like ~20 dollars per hour… the end developer… gets NO MORE THAN 18 DOLLARS PER DAY" (bad_coder, 2013, https://news.ycombinator.com/item?id=6750782) [first-hand, old, extreme] | Around 10% of the bill rate reaches the developer. An outlier |
| Proxify, Turing, Andela, Upwork | Pricing and fee pages blocked (403) or not found | **Not verified** |

[inference] A reasonable range for Pemby's messaging: marketplaces keep **~30–50% of the client rate**; large listed outsourcers run **~29% gross margin** company-wide, but individual spreads on senior staff are wider because the average includes bench time and juniors; small local body shops can keep much more. A 7-year Moldovan senior who moves from an outsourcer to a direct B2B contract could plausibly raise take-home by 1.5–2× at the same client price. **This is an estimate, not a measured figure.**

---

## 4. How job posts signal location eligibility

### 4.1 Structured fields in public ATS job-board APIs

| ATS | Public endpoint | Location fields | Remote flag | "Eligible countries" field? | Source |
|---|---|---|---|---|---|
| **Greenhouse** | `GET boards-api.greenhouse.io/v1/boards/{token}/jobs` (no auth) | `location.name` (free text); `offices[]` with `name` and a `location` string (e.g., "United States"), nested via `parent_id`/`child_ids` | **None** | **No** | [primary] https://docs.greenhouse.io/job-board.html |
| **Lever** | Postings API | `categories.location`, `categories.allLocations[]`, `country` (ISO alpha-2 or null, "not filterable") | `workplaceType`: `unspecified`, `on-site`, `remote`, `hybrid` | No (allLocations is a proxy) | [primary] https://github.com/lever/postings-api |
| **Ashby** | Public job posting API | `location`, `secondaryLocations[]`, `address.postalAddress.addressCountry` | `isRemote` (bool), `workplaceType`: `OnSite`/`Remote`/`Hybrid` | No (secondaryLocations is a proxy) | [primary] https://developers.ashbyhq.com/docs/public-job-posting-api |
| **Workable** | `www.workable.com/api/accounts/<subdomain>?details=true`, `/locations` (no auth) | `location_str`, `country`, `country_code`, `region`, `city`; locations array | `telecommuting` (bool), `workplace_type` | No | [primary] https://help.workable.com/hc/en-us/articles/115012771647-Using-the-Workable-API-to-create-a-careers-page |
| **SmartRecruiters** | Posting API | `location.city`, `region`, `country` (ISO-2), `latitude`, `longitude` | `remote` (bool); `hybrid` bool per a search snippet [unverified] | No | [primary] https://developers.smartrecruiters.com/docs/objects |

Key finding: across all five ATSs, **"country" describes the job's anchor location, not the set of countries a remote hire may live in.** A US company posting "Remote" in Ashby might set `addressCountry: USA` and `isRemote: true` for a job that is actually open worldwide, or US-only. The structured data cannot tell these apart, so the answer usually sits in the description text.

### 4.2 schema.org and Google for Jobs

- `applicantLocationRequirements`: "The location(s) applicants can apply from. This is usually used for telecommuting jobs." `eligibilityToWorkRequirement` is a separate property: "The legal requirements such as citizenship, visa and other documentation required" [primary] (https://schema.org/JobPosting).
- `jobLocationType`: `TELECOMMUTE` [primary] (https://schema.org/JobPosting).
- Google requires the `TELECOMMUTE` value to mean "100% of the time" remote. It requires "a minimum of one country from which applicants are eligible to work, using `applicantLocationRequirements` (preferred), or a default to the country of a `jobLocation`". It says not to mark up hybrid or "negotiable" remote jobs [primary] (https://developers.google.com/search/docs/appearance/structured-data/job-posting).
- [inference] This is the best available structured signal, but it has two failure modes. (a) The **fallback to `jobLocation`** makes worldwide jobs look country-locked. (b) Employers must list countries, so "worldwide" is rarely expressed cleanly. Many ATS-generated career pages emit JSON-LD, which makes it worth parsing when present. Adoption rates were not measured.

### 4.3 Free-text conventions seen in the wild

- HN "Who is hiring? (September 2026)" rule: "include REMOTE for remote work, REMOTE (US) or similar if the country is restricted, and ONSITE when remote work is not an option" [primary] (https://news.ycombinator.com/item?id=49522897).
- WorkingNomads `location` values, verbatim: "USA only", "Worldwide", "Latin America, Europe, Canada, UK, South Africa", "USA, Canada or UK only", "Europe, LATAM, APAC, the U.S., Canada", "Time zone: CET (+/- 3 hours)", "Remote (Worldwide) - Working East Coast Hours" [primary API] (https://www.workingnomads.com/api/exposed_jobs/).
- Remotive `candidate_required_location`: "Worldwide"; "France, Japan, Turkey, Vietnam, Mexico, Norway"; "LATAM, Europe, USA, Canada, APAC" [primary API] (https://remotive.com/api/remote-jobs). The API terms forbid redistributing its jobs to third-party sites, which matters if Pemby ingests it.
- Jobicy `jobGeo`: "Canada, Europe", "LATAM, Canada, Europe", "USA" [primary API] (https://jobicy.com/api/v2/remote-jobs).

### 4.4 Reliability problems, and a phrase taxonomy Pemby can classify

Problems observed in the sources above:
1. **Ambiguous regions.** Does "Europe" include Moldova, Ukraine, or Serbia? Does "EMEA" include all of Africa? Nobody defines these terms. [inference]
2. **Timezone and legal limits get conflated.** "Remote (Worldwide) - Working East Coast Hours" is legally open but practically limited. Himalayas explicitly separates "*when* you need to be available" from "*where* you need to be legally based" [primary] (https://himalayas.app/docs/how-remote-jobs-work-on-himalayas).
3. **Missing data gets read as "open".** Himalayas notes some jobs without geographic data "appear across all filter categories by default" [primary, same link].
4. **Late disclosure.** GitLab says all roles are remote but some carry location-based eligibility requirements that Talent Acquisition discusses during the process [secondary summary of the GitLab handbook, from a search snippet] (https://handbook.gitlab.com/handbook/people-group/employment-solutions/).
5. **Stale policies**, as with PostHog's Syria line in §1.2.
6. **No engagement-type dimension.** "US only" usually means "US only *for employees*"; the post rarely says whether a B2B contractor abroad is acceptable. [inference]

Suggested classes for text extraction [inference]:

| Class | Example phrasings | Meaning |
|---|---|---|
| Hard legal, country | "must be based in", "must reside in", "authorized to work in the US", "we can only hire in" | Blocking, unless the company also accepts contractors |
| Hard legal, person | "US person", "ITAR", "security clearance", "US citizen" | Blocking by citizenship, not residence |
| Region | "EMEA", "Europe", "LATAM", "CET ± 3" | Needs a region-to-country map with a confidence score |
| Timezone overlap | "4 hours overlap with EST", "US hours" | Soft. Moldova overlaps US Eastern mornings |
| Engagement openness | "contractor", "B2B", "via Deel/Remote", "EOR", "worldwide via Deel" | Raises eligibility for non-entity countries |
| Explicit worldwide | "anywhere", "worldwide", "global" | Open, but still check sanctions and timezone text |

---

## 5. Existing boards that filter by "can hire from my country"

| Tool | How it models eligibility | What it gets wrong | Source |
|---|---|---|---|
| **Himalayas** | Employer-set `locationRestrictions[]` (country names) and `timezoneRestrictions[]` (UTC offsets) in its public API; "worldwide" means no restrictions. The Moldova country page shows ~2,146 jobs | Jobs with no data can show up in every country filter. Its own Moldova page mixes explicit country lists ("AL, AD + 71 more") with many entries showing no location text. A third-party review says you still have to read the descriptions [secondary] | [primary] https://himalayas.app/jobs/api ; https://himalayas.app/docs/how-remote-jobs-work-on-himalayas ; https://himalayas.app/jobs/countries/moldova ; [secondary] https://www.jobshives.com/blog/himalayas-alternatives-2026 |
| **Remote Rocketship** | Country page for Moldova; of the first 10 jobs, 9 are "Anywhere in the World" and one is "Moldova – Remote". Method not disclosed | "Worldwide" is taken at face value, and there is no contractor/employee distinction [inference] | https://www.remoterocketship.com/country/moldova/jobs/software-engineer/ |
| **Working Nomads** | Single free-text `location` string | Not normalized; timezone mixed into location | https://www.workingnomads.com/api/exposed_jobs/ |
| **Remotive** | Free-text `candidate_required_location` | Region lists with no country expansion; redistribution restricted | https://remotive.com/api/remote-jobs |
| **Jobicy** | Free-text `jobGeo` | Same | https://jobicy.com/api/v2/remote-jobs |
| **RemoteOK**, **We Work Remotely** | Not verified (403) | — | — |
| **Arc.dev** | Talent marketplace: "450,000 talent in 190 countries". Eligibility filtering on its job board not verified | Arc sits between the developer and the company (see §3) | https://arc.dev/ |

Shared failure modes [inference, based on the observations above]:
1. Eligibility is **one boolean per job**, when it really depends on (country × engagement type: employee, EOR, contractor).
2. **No company-level memory.** Each post is judged alone, even when the same company has hired in Moldova before.
3. **Missing data counts as "open"**, which floods country pages with false positives.
4. **No region expansion rules.** Nobody publishes whether "Europe" includes non-EU candidate countries.
5. **No negative constraints** such as sanctions lists, EAR D:1 sensitivity for regulated industries, or timezone bands.
6. **No feedback loop** from candidates who actually applied from country X and were rejected or hired.

---

## 6. Inferring "will this company actually hire someone from country X?"

All of §6 is **[inference]** design reasoning built on the sourced facts above.

### 6.1 Signals, ranked by strength

| # | Signal | How to get it | Strength | Notes |
|---|---|---|---|---|
| 1 | **Verified outcomes from Pemby users** ("offered", "rejected for location") from country X | In-product reporting after applying | Strongest | Needs anti-gaming and minimum counts per company |
| 2 | **Explicit company policy pages** | Handbooks and careers pages, e.g., GitLab's entity list and "not hiring in locations without entity or PEO"; PostHog's GMT+2 to GMT−8 band and EOR exclusions; Automattic's "83 countries" | Strong, but goes stale | Store with a fetch date and re-check periodically; the PostHog Syria line shows the drift |
| 3 | **Posting history across countries** | Snapshot the Greenhouse `offices`, Lever `allLocations`, Ashby `secondaryLocations`, and Workable `/locations` endpoints over time; keep every country each company has ever posted for | Strong for "has hired in region" | Pemby must build this history itself because the APIs only show current jobs |
| 4 | **Job-post text** mentioning contractors, B2B, EOR, or Deel/Remote/Oyster | Classify with the taxonomy in §4.4 | Medium to strong | "Via Deel" suggests a non-entity-country pipeline already exists |
| 5 | **schema.org `applicantLocationRequirements`** on the career page | Parse JSON-LD | Medium | Discount when it simply equals the `jobLocation` country (Google's fallback) |
| 6 | **Current employee locations** | Public GitHub org members' profile locations; team pages; conference talks. LinkedIn scraping is legally and ToS-risky [unverified] | Medium | Tells you "has people there", not how they are engaged |
| 7 | **EOR provider support for country X** | Deel and Remote country pages; Moldova is supported by both (§2.2) | Weak on its own | Shows *possible*, not *willing* |
| 8 | **Timezone band** | Text or policy | Filter | Moldova is UTC+2/+3, so bands reaching GMT+2/+3 pass |
| 9 | **Hard negatives** | OFAC comprehensive embargoes (Cuba, Iran, North Korea, Crimea/DNR/LNR; Syria removed July 2025); US-person, clearance, or ITAR text; EAR D:1 plus regulated industry | Blocking | Moldova is not embargoed but is in D:1; this matters only for export-controlled work |

### 6.2 A simple scoring shape

For each (company, country, engagement type), output a tier with visible evidence:

- **Confirmed**: user-verified hire from X, or an explicit policy naming X.
- **Likely**: posting history includes X or its region; worldwide or contractor-open text; no hard negatives.
- **Unknown**: no evidence either way. **Do not show as "open".**
- **Unlikely**: employee-only language plus a narrow entity list without X; timezone band excludes X.
- **Blocked**: sanctions, citizenship or clearance requirements.

Show the evidence lines, with source URLs and dates, next to the tier, so users can judge stale or weak signals.

---

## What was not verified (open questions)

- Multiplier, Papaya, and Rippling support for Moldova, and their prices (pages blocked).
- Whether Deel's contractor product and Contractor of Record specifically support Moldova (the contractor page returned an empty template).
- Exact receive and withdraw features for PayPal, Wise, and Payoneer in Moldova. Crypto's legal and tax status in Moldova.
- National Bank of Moldova rules on residents' foreign accounts and repatriation, beyond the government's April 2025 announcement.
- The IT Park 70% revenue threshold, the 2035 vs 2037 end date, and how the minimum tax and social coverage apply to a one-person ÎI.
- Take rates for Proxify, Turing, Andela, and Upwork. Toptal numbers rest on old anecdotes and a competitor's blog.
- OFAC's exact Crimea/DNR/LNR embargo wording; LinkedIn's remote-job location rules; RemoteOK and We Work Remotely data models.
- SmartRecruiters `hybrid` field (search snippet only).
- How the EDPB transfer analysis applies to an individual contractor, as opposed to a separate company.
- Tax regimes in Armenia and Serbia, plus LATAM, Africa, and South Asia.

---

## Product implications for Pemby

1. **Model eligibility as (country × engagement type), not a yes/no.** For Moldovan developers the most valuable filter is "accepts international B2B contractors". Most legal blockers (payroll, labour law, PE, EOR cost) are employee-only (§1.1). A US-only-for-employees company may still be reachable as a contractor.
2. **Treat "unknown" as its own state and never as "open".** That is the main false-positive source on Himalayas-style boards (§5). Users would rather see fewer jobs they can trust.
3. **Build company-level memory from day one.** Snapshot Greenhouse, Lever, Ashby, Workable, and SmartRecruiters boards on a schedule and store every country and region each company has posted for (§4.1, §6.1). Current-state APIs cannot rebuild this later.
4. **Make crowd-sourced outcomes the core loop.** "I applied from Moldova as a contractor and got an offer or rejection" is the strongest signal and the one competitors lack. Design reporting, verification, and minimum-sample rules early.
5. **Ship a region-to-country map with honest confidence.** Examples: "Europe" → EU/EEA high confidence, Moldova/Ukraine/Balkans low; "EMEA"; "LATAM"; "CET ± 3". Let users see and correct it.
6. **Separate timezone from legal location in the UI.** Show "legally open" and "hours overlap with you" as two badges. Moldova (UTC+2/+3) fits European bands and US-Eastern-morning overlap (§1.2).
7. **Apply hard negatives automatically and keep them current.** Maintain the OFAC embargo list (remember Syria was removed in July 2025), US-person, clearance, and ITAR text detection, and an EAR D:1 caution for regulated industries (§1.2). Date-stamp every policy snippet because company pages go stale.
8. **Add a "get set up to be hireable" guide for each supported country.** For Moldova: IT Park 7% vs freelancer 15% vs standard ÎI; invoicing; SWIFT, Payoneer, and Wise; no Stripe (§2). A founder-country guide is credible content and lowers the barrier the user faces today. Get it reviewed by a local accountant, since the 2026 rules are new.
9. **Show the middle-man spread.** A rate calculator comparing "outsourcer take-home" with "direct B2B take-home", using the ~30–50% marketplace spread and ~29% EPAM gross margin as clearly labeled estimates (§3), explains why going direct is worth the effort. Label the numbers as estimates.
10. **Respect data-source terms.** Remotive forbids redistribution (§4.3), and LinkedIn scraping is risky. Prefer the official public ATS endpoints and company-published pages, which are also the highest-signal sources.
11. **Parse schema.org JSON-LD but discount the fallback.** Treat `applicantLocationRequirements` equal to the `jobLocation` country as weak evidence (§4.2).
12. **Consider EU-client friction.** EU companies hiring a Moldovan contractor may need GDPR transfer paperwork (SCCs), while EOR employees do not (§1.2). Pemby could tag EU employers that already work with non-EU contractors as lower-friction.
