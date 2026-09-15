# 11 — Moldova IT Park (MITP) eligibility for Pemby

Researched 2026-09-15. Question: can a Moldovan SRL that is an MITP resident sell Pemby access passes (for example $10 for 3 months) worldwide through Paddle as merchant of record, and count that revenue as eligible under Law 77/2016 at the 7% single tax? What about affiliate commissions from EOR providers and fees from employers?

> **Not legal or tax advice.** This note summarises public primary material so the founder can ask sharper questions. Before signing the MITP contract or the Paddle agreement, confirm every conclusion with a Moldovan accountant or tax adviser, and ideally in writing with MITP (info@mitp.md).

**Method and source limits.**

- **legis.md was not readable.** It sits behind a Cloudflare challenge that blocks automated fetches (HTTP 403 via curl, WebFetch and a proxy). The Wayback copy of Law 77/2016 loads its text by JavaScript and came back empty. The law and the Tax Code are therefore quoted **as MITP's official documents quote them**, mainly the MITP Administration's signed Decision no. 1 of 12.02.2026 on the annual verification. The quotes are verbatim from those documents, but I did not compare them against the consolidated text on legis.md. Law links for manual checking: Law 77/2016 <https://www.legis.md/cautare/getResults?doc_id=121327&lang=ro> (the doc_id MITP links as Law 77/2016), plus the other legal-framework links on <https://mitp.md/ro/cadrul-juridic-si-documentatie/>.
- **Web search was unavailable** (session budget exhausted). I could not look for 2025–2026 amendments outside mitp.md. "No amendment found" below means no amendment on mitp.md, which is weaker than no amendment at all.
- **sfs.md, bnm.md and maib.md** were reachable, but I did not find the specific pages on currency-control documents. Those points are marked UNVERIFIED.

Sources actually read (all fetched 2026-09-15):

| Short name | URL |
|---|---|
| MITP eligibility page (EN / RO) | <https://mitp.md/why-mitp/eligible-criteria-activities/> · <https://mitp.md/ro/de-ce-mitp/conditiile-pentru-rezidenta/> |
| MITP FAQ | <https://mitp.md/why-mitp/faq/> |
| MITP single-tax page | <https://mitp.md/why-mitp/about-7-single-tax/> |
| MITP about-residency page | <https://mitp.md/about-residency/> |
| **Decision 1/2026** (annual verification methodology, quotes Law 77 art. 2 and Tax Code art. 368) | <https://mitp.md/wp-content/uploads/2026/06/Decizie-nr.1-din-12.02.2026_Verificare-anuala-2026.semnat.semnat.pdf> |
| **Resident Guide** (Ghidul Rezidentului, RO) | <https://mitp.md/wp-content/uploads/2026/05/Ghidul-Rezidentului-MITP_ro.pdf> |
| **Eligibility Guide** (Ghid de eligibilitate, 12.2024, RO) | <https://mitp.md/wp-content/uploads/2026/05/Ghid-de-eligibilitate_12.2024.pdf> |
| MITP news: 2024 amendment of Law 77 | <https://mitp.md/amendment-of-the-law-on-it-parks-published-in-the-official-monitor/> |
| MITP news: 2024 amendment of HG 1144/2017 | <https://mitp.md/ro/modificarea-hg-1144-2017-cu-privire-la-crearea-parcului-pentru-tehnologia-informatiei-moldova-it-park/> |
| MITP news: 2025 results (Feb 2026) | <https://mitp.md/moldova-innovation-technology-park-announces-an-all-time-record-the-turnover-of-resident-companies-exceeded-usd-1-billion-in-2025/> |
| MITP post index since 2025 (WordPress API) | <https://mitp.md/wp-json/wp/v2/posts?after=2025-01-01T00:00:00&per_page=100> |

---

## Verdict

1. **Pemby's core revenue should be eligible.** Paid access to a web app fits **58.29** (58.29.40 "online software") or **63.11** (63.11.13 "application service provision (SaaS)"). Both are listed in art. 8 of Law 77/2016. The export-only condition applies only to 82.20 and 78.30, so selling via Paddle (UK) causes no eligibility problem as such.
2. **The rule is 70% of sales revenue from eligible activities, measured monthly on a year-to-date cumulative basis.** Up to 2 months a year may fall below 70% as long as the annual figure holds. An auditor checks it every year, contract by contract, with no sampling.
3. **Affiliate commissions (Deel etc.) and employer placement fees should be treated as non-eligible** for planning purposes. **78.10 (employment placement agencies) is not on the list.** 78.30 is, but only for staff provision, export-only, and limited to IT, admin and logistics staff. That does not describe placement fees. Keep all such revenue safely under 30% on a monthly cumulative basis.
4. **The 7% single tax covers all sales revenue**, eligible or not. It does **not** cover VAT, withholding tax or excise. Exports count toward the **1.2 million MDL VAT registration threshold**.
5. **No 2025–2026 change to the rate, the eligibility list or the end dates was found on mitp.md.** MITP says the regime is state-guaranteed to **2035** and the park runs to **31 Dec 2037**.

---

## 1. The eligibility rule

### 1.1 The law's wording

**Law 77/2016, art. 2 (definitions)**, as quoted in Decision 1/2026, p. 5:

> RO: „Rezident al parcului – persoană juridică sau fizică, înregistrată în Republica Moldova în calitate de subiect al activității de întreprinzător, care este inclusă în Registrul de evidență a rezidenților parcului și care practică, drept activitate principală, una sau mai multe din activitățile prevăzute la art. 8, în baza unui contract încheiat cu Administrația parcului.
> Activitate principală – activitate care generează 70% sau mai mult din venitul din vînzări al rezidentului parcului."

> EN (my translation): "Park resident: a legal or natural person registered in the Republic of Moldova as an entrepreneur, entered in the Register of park residents, which carries out **as its main activity** one or more of the activities in art. 8, under a contract with the Park Administration.
> Main activity: an activity that generates **70% or more of the park resident's sales revenue**."

**Tax Code, art. 368(2)–(3)**, as quoted in Decision 1/2026, pp. 5–6:

> RO: „(2) Pentru determinarea faptului dacă rezidentul parcului pentru tehnologia informației desfășoară activitate principală, care generează 70% sau mai mult din veniturile din vînzări, se calculează raportul dintre suma venitului obținut din vînzarea serviciilor, lucrărilor permise în parc în conformitate cu art.8 din Legea nr.77/2016 […] și suma totală a venitului din vînzarea produselor (mărfurilor), prestarea serviciilor, executarea lucrărilor. În acest caz, ambii indicatori ce țin de mărimea venitului din vînzări se determină lunar, cu total cumulativ de la începutul anului calendaristic respectiv, dacă statutul de rezident al parcului a fost dobândit în anii calendaristici precedenți, sau de la aplicarea regimului special de impozitare, dacă statutul de rezident al parcului a fost dobândit în anul calendaristic curent.
> (3) Nu se consideră încălcare a prevederilor alin.(2) neîndeplinirea indicatorului ce ține de activitatea principală pe parcursul a cel mult oricăror 2 luni calendaristice ale anului calendaristic în curs, cu condiția asigurării indicatorului de 70% calculat total pentru anul respectiv […]"

> EN: "(2) To determine whether the IT park resident carries out a main activity generating 70% or more of sales revenue, compute the ratio of revenue from sales of services and works permitted in the park under art. 8 of Law 77/2016 to total revenue from sales of products (goods), services and works. **Both figures are determined monthly, cumulatively from the start of the calendar year** (or from the start of the special tax regime, if resident status was obtained in the current year).
> (3) Missing the main-activity indicator in **at most any 2 calendar months** of the current year is not a breach, **provided the 70% indicator is met for the year as a whole** […]"

MITP's own plain-language version (<https://mitp.md/why-mitp/eligible-criteria-activities/>): "70% or more of the sales revenue will be generated from the eligible activities provided by law. This indicator must be achieved both annually and monthly. However, it is not considered a violation if this figure is not achieved cumulatively by the resident for no more than two months during a calendar year."

### 1.2 How the rule is measured in practice

- **Monthly, on form IU17.** Resident Guide p. 11: „Calcularea acestui raport se realizează lunar de către rezident prin darea de seamă IU17." (The resident calculates the ratio monthly on the IU17 return.) IU17 is due by the 25th of the following month.
- **Worked example** (Resident Guide p. 11): Jan 100k eligible of 100k total gives 100%. Feb cumulative 180k of 200k gives 90%. Mar cumulative 240k of 290k gives 83%. The ratio is **year-to-date cumulative**, not month-by-month.
- **Annual audit.** Law 77 art. 18(1) requires an annual verification by a registered audit entity that the resident chooses and pays for. Results are filed on mitp.md by **30 April** (FAQ; Decision 1/2026). The procedure is an ISRS 4400 agreed-upon-procedures engagement. Points that matter for Pemby, from Decision 1/2026, Indicator 2:
  - The auditor examines "integral relația contractuală în complexitate și substanță … fără aplicarea metodei de eșantionare": the whole contractual relationship, in substance, **without sampling**. That covers contracts, invoices, service acts, payment orders and bank statements.
  - It checks whether the substance of each service fits the CAEM-2 and CSPM rev. 2.1 descriptions, including their explanatory notes.
  - **Point 8(c):** it checks "dacă sumele înregistrate sunt brute sau nete de alte cheltuieli (inclusiv taxe reținute la sursa de plată sau comisioane bancare)", i.e. whether revenue was booked gross or net of withheld costs, and **recalculates revenue to include the withheld costs**. This matters for Paddle's fee (§3.2).
  - It checks that the activities performed are listed in the resident contract or in addenda to it.
- **Consequence of failing.** Resident Guide p. 16, citing Law 77 art. 15(5) and Tax Code art. 378(1): obligations to the budget „se recalculează în modul general stabilit (regimul fiscal standard), începând cu perioada fiscală în care a fost comisă încălcarea". Tax is recalculated under the standard regime **from the period of the breach**, plus penalties and interest.
- **Which classifiers apply.** CAEM-2 (NBS Order 28 of 07.05.2019) and CSPM rev. 2.1 (NBS Order 9 of 30.01.2024), per Decision 1/2026 Indicator 2, point 1.

### 1.3 Other conditions (short)

- Registered in Moldova as an entrepreneur, not suspended, not insolvent or in liquidation (eligibility page).
- Employees are notified in writing about the social and health insurance and salary-tax rules, before the resident contract is signed, or before a new hire starts (FAQ; Law 77 art. 16(3)).
- **Resident fee:** 150 MDL for the first month and a 150 MDL monthly minimum. Above that, the fee is set by the formula MAX((MITP budget / all residents' projected revenue × own projected revenue) / 12, 150) (<https://mitp.md/about-residency/>). *Conflict:* the Resident Guide (p. 15) says the first-month fee is 50 MDL. The newer site and FAQ say 150 MDL. Trust the site.
- **Minimum single tax:** 30% × projected average salary (17,400 MDL in 2026) × number of employees who worked at least one day, which is 5,220 MDL per employee per month (single-tax page; FAQ).
- The special regime starts on the **1st of the month after** the contract is signed (FAQ, citing Tax Code art. 375).

---

## 2. Eligible CAEM codes and how Pemby's revenue maps

### 2.1 The art. 8 list

From Resident Guide pp. 12–13, which reproduces art. 8 of Law 77/2016 as amended. Decision 1/2026 cites art. 8 "în redacția completărilor introduse prin Legea nr. 125 din 30 mai 2024, în vigoare din 31 mai 2024" (as supplemented by Law 125 of 30 May 2024, in force 31 May 2024).

| Letter | Code | RO wording (abridged) | EN |
|---|---|---|---|
| a | 62.01 | activități de realizare a soft-ului la comandă | custom software development |
| b | 58.21 | editare a jocurilor de calculator | computer game publishing |
| c | **58.29** | **editare a altor produse software** | **other software publishing** |
| d | 62.03 | management al mijloacelor de calcul | computer facilities management |
| e | **63.11** | **prelucrarea de date, administrarea paginilor web și activitățile conexe** | **data processing, hosting and related** |
| f | **63.12** | **activități ale portalurilor web** | **web portals** |
| g | 62.02 | consultanță în tehnologia informației | IT consultancy |
| h | 62.09 | alte activități de servicii în tehnologia informației | other IT services |
| i | 85.59 | limitate la instruirea în domeniul calculatoarelor | limited to IT training |
| j | 72.19 | R&D using high-performance computing, limited sub-codes | |
| k | 72.11 | biotech R&D, limited | |
| l | 26.11 | microprocessors and ICs only | |
| m, o | 59.12 | VFX and animation (HPC); colour grading and sound for games only | |
| n | 74.10 | specialised design based on HPC | |
| p | 59.20 | original sound recordings for games only | |
| q | 82.20 | call centres, **prestate exclusiv spre export** (export only) | |
| r | **78.30** | alte servicii de furnizare a forței de muncă … **exclusiv spre export, limitate la** 78.30.11 (IT & telecom staff), 78.30.12 (administrative staff), logistics and freight customer-relations staff | other human-resources provision, **export only**, limited |

**Not on the list:** 73.11 (advertising agencies), 70.22 (management consultancy), **78.10 (employment placement agencies)**, 78.20 (temporary employment agencies), 74.90, 66.19, 82.99, and every other code.

### 2.2 Pemby's time-limited access passes: eligible

The MITP eligibility page reproduces the classifier descriptions (<https://mitp.md/why-mitp/eligible-criteria-activities/>):

- **58.29.40 Online Software:** "software intended to be executed online (cloud-based / web-based software)". RO (Eligibility Guide, annex): „programe de calculator care sunt destinate a fi executate on-line".
- **63.11.13 Application Service Provision (SaaS):** "provision of software applications hosted and managed on centralized infrastructure … without customization, where applications are accessed via the web".
- **58.29.50 Licensing services for the right to use software:** relevant if the Paddle agreement is framed as a licence or resale to Paddle.
- Note the 58.29 class exclusion on the same page: "online provision of software (application hosting and related services) (see 63.11)". The classifier itself points both ways. **Declare both 58.29 and 63.11 in the resident application and contract**, and use one of them consistently on invoices. Both are eligible, so the choice does not affect the 70% test. The auditor does check that the activity appears in the contract.

**Substance test: what would push Pemby's pass revenue out of 58.29/63.11.** The Eligibility Guide and Resident Guide stress substance over form:

- "Computer as a tool" rule (Resident Guide p. 15): „Nu se consideră activități eligibile, situația unde rezidentul MITP folosește computerul doar ca un instrument de lucru (unealtă), asemenea activități fiind clasificate potrivit naturii serviciilor furnizate." (Where the computer is only a working tool, the activity is classified by the nature of the service.) Test: would the service still exist without the software? If Pemby's value were humans applying to jobs, writing CVs or coaching, it would be classified by that nature (career services, HR consulting), not as software.
- Staff job titles are evidence. Eligibility Guide p. 24 (under 63.11): if the staff doing the work hold HR roles, the service may be classified as „70.22 … 78.10 ”activități ale agențiilor de plasare a forței de muncă”, 78.20 …". This is the clearest official signal that **a job-related product can be reclassified to 78.10**.
- Contract and invoice wording is evidence. Describe the product as software access ("3-month access to the Pemby web application"), never as "job placement", "recruitment" or "we get you hired".

### 2.3 Other revenue lines

| Revenue line | Likely code | Eligible? | Basis |
|---|---|---|---|
| Access passes sold via Paddle | 58.29.40 / 63.11.13 (/58.29.50 if licence to Paddle) | **Yes** | §2.2 |
| **Affiliate / referral commissions from Deel, Remote etc.** | No listed code fits. Probably 73.11 (advertising/marketing), 74.90 or an agent/intermediation code | **Treat as NO** (UNVERIFIED classification) | The Eligibility Guide (p. 16) says marketing services, even online ones, are 73.11 and „activitate neeligibilă": „nu contează modalitatea de realizare – online sau publicitate prin pliante" (online or leaflets, it doesn't matter). A commission for referring a customer is promotion or intermediation, not software. |
| Display ads or sponsored placements on Pemby's own site | 63.12.20 "Online Advertising Space on Web Portals", or 63.11.20 "Internet Advertising Space or Time" | **Possibly yes** (UNVERIFIED for Pemby) | Both sub-codes sit inside eligible classes on the MITP page. The Eligibility Guide's "Google AdSense" red flag (p. 17) says ad income from a resident's own software product „pot fi considerate ca derivat … obținut ca urmare a utilizării produsului software creat" (may be treated as derived from using the software). The same page warns that if staff are mainly marketing specialists (CORM group 2431), the income risks being 73.11. |
| Employer fees for job posts or listings on a Pemby job board | 63.12 (web portal) or 78.10 | **Uncertain. Assume NO until confirmed** | 63.12 in CAEM-2 means search-engine portals and media sites with regularly updated content. In NACE Rev. 2, which CAEM-2 mirrors, 78.10 explicitly includes online employment placement agencies (**UNVERIFIED against the CAEM-2 text**; legis.md and the NBS classifier were not reachable). |
| **Employer fees for candidate introductions, placements or success fees** | **78.10** | **NO** | 78.10 is not in art. 8. 78.30 is not a substitute: it covers *provision* of workforce (staff leasing, where the employees stay on the provider's payroll), export-only, limited to IT, admin and logistics staff. See the MITP 78.30 description: "employees remain on the payroll of the staffing agency, which is legally responsible for them". |

### 2.4 Employment-agency code risk (flag)

- **78.10 is the main eligibility risk for Pemby.** The Eligibility Guide names it as a reclassification target for job and HR-flavoured services (p. 24).
- The risk has two parts:
  1. **Direct:** any employer-paid placement or introduction fee is 78.10 and non-eligible.
  2. **Indirect:** if the product or its marketing looks like placement (for example "we apply for you", human recruiters, a guaranteed interview), an auditor could classify the **pass revenue itself** by its nature as employment services, not software. That could break the 70% test from the first month, with recalculation under the standard regime.
- **Outside tax:** operating as an employment or placement agency in Moldova may carry its own licensing or registration duties. Many jurisdictions also restrict charging job seekers fees for placement. This is **UNVERIFIED** and outside this note's evidence. Ask the lawyer.
- **Mitigation:**
  - Keep job-seeker-paid revenue strictly software access, where the tool does the work.
  - Keep employer and affiliate income in separate contracts and invoices with separate prices. The Eligibility Guide p. 17 recommends splitting mixed services by code with a separate price for each.
  - Model the monthly cumulative ratio so non-eligible income stays well under 30%.
  - Get MITP's view on the planned revenue mix before applying. The Administration reviews applications, and the FAQ says residents "declare them on their own responsibility".

---

## 3. Revenue via Paddle (merchant of record)

### 3.1 Eligibility and the export question

- **Export is not required for 58.29 or 63.11.** Eligibility Guide p. 45: „Legea 77/2016 instituie cerința de exclusivitate spre export doar pentru 2 genuri de activitate – 82.20 și 78.30." Its diagram gives other art. 8 activities "locale: de la 0 până la 100% / export: de la 0 până la 100%". Paddle being a UK reseller rather than the end customer does not change eligibility.
- **Documentation through a platform is accepted.** The Eligibility Guide (p. 14, "Prestarea serviciilor prin intermediul platformelor") covers Upwork and Toptal-style platforms. The contract may be online terms and conditions, and where invoices lack detail, additional documents are needed „care confirmă natura serviciilor prestate". The guide concludes the narrower document set is still sufficient to determine the nature of the service. By analogy (**UNVERIFIED for MoR resellers**), keep for each month:
  1. the signed or accepted Paddle agreement (Master Services Agreement or seller terms) naming the product,
  2. Paddle's payout statement or remittance advice and the transaction report,
  3. an invoice or self-billing document from the SRL to Paddle describing "software access / SaaS subscription – Pemby",
  4. the MAIB bank statement showing the SWIFT receipt.

### 3.2 How much revenue to book (gross vs net of Paddle's fee)

- The single-tax base is sales revenue recorded monthly under national accounting standards or IFRS (FAQ, citing Tax Code art. 369).
- Resident Guide p. 26 example: an 8,000 EUR invoice where a correspondent bank deducted 15 EUR. Revenue is **gross**, the invoice amount at the BNM official rate on the invoice date. The bank fee does not reduce revenue.
- Decision 1/2026 point 8(c): the auditor reports whether revenue was booked net of withheld costs and recalculates it to include them.
- **Open question (UNVERIFIED):** under a true reseller model, the SRL's sale is to Paddle at the price Paddle owes the SRL, and Paddle's 5% + 50¢ sits in Paddle's margin, not in the SRL's revenue. Under an agency reading, the SRL's revenue is the customer price and Paddle's fee is an expense. The Paddle contract wording decides it. The audit methodology leans toward grossing up. The tax difference is small (7% of ~5–10% of sales). The bigger issue is booking it consistently with what the auditor will accept. **Consumer VAT or sales tax that Paddle collects is Paddle's liability and should not be the SRL's revenue** (UNVERIFIED; confirm with the accountant).
- Refunds and chargebacks: Decision 1/2026 point 9 has the auditor reconcile revenue reversed after the reporting date. Book reversals in the month they happen.

### 3.3 VAT

- **Not covered by the single tax.** Tax Code art. 372(2), per the FAQ: "3. Value-added tax (VAT)". MITP's single-tax page: "Does not include: VAT (0% on exports)". <https://mitp.md/why-mitp/about-7-single-tax/>
- **Registration threshold counts exports.** Resident Guide p. 34: „obligat să se înregistreze în calitate de plătitor TVA, dacă într-o oricare perioadă de 12 luni consecutive, a efectuat livrări de mărfuri și servicii în sumă ce depășește 1,2 milioane MDL" (must register for VAT if taxable supplies exceed 1.2 million MDL in any 12 consecutive months). Taxable supplies include „livrările scutite de TVA cu drept de deducere (ex. exporturile)" (exempt-with-deduction supplies, e.g. exports). At an assumed 17–18 MDL/USD (**exchange rate UNVERIFIED**), the threshold is roughly $67–70k of revenue over any rolling 12 months.
- **Export-of-services evidence.** Resident Guide p. 39: taxable persons must submit, among other documents, „confirmarea de la beneficiarul serviciilor exportate (conform art. 102 alin. (15) din Cod Fiscal și pct. 32 subpct. 2) lit. a) din Regulamentul privind restituirea TVA, HG nr. 93/2013)". That is confirmation from the beneficiary of the exported services. A service act signed or accepted by both parties can serve as that confirmation. For Paddle, whether a payout statement counts is **UNVERIFIED**.
- **Invoices for export:** a Moldovan "factura fiscală" is optional. An invoice with the mandatory elements of art. 11(7) of Accounting Law 287/2017 is enough (Resident Guide p. 37).
- **UNVERIFIED, ask the accountant:**
  - the exact Tax Code articles on place of supply for services to a non-resident business (whether Paddle counts as a B2B recipient outside Moldova, so the supply is outside Moldovan VAT or zero-rated),
  - whether **reverse-charge VAT on imported services** (hosting, LLM APIs such as OpenRouter, SaaS tools, possibly Paddle's own fee) applies to the SRL before VAT registration.

### 3.4 Currency control and MAIB documents (mostly UNVERIFIED)

- I could not reach the BNM regulation on foreign-exchange operations or MAIB's business pages on incoming SWIFT (404s). The BNM framework is Law 62/2008 on foreign exchange regulation plus BNM regulations. **UNVERIFIED**, not read.
- **What was verified:** MAIB's site lists a business support line "+373 22 022 495 - plăți/încasări VS/MDL în așteptare, solicitare documente/clarificari" (foreign-currency/MDL payments and receipts on hold; requests for documents and clarifications) (maib.md business pages, fetched 2026-09-15). MAIB does hold incoming foreign-currency funds pending documents.
- **Likely document set (UNVERIFIED; confirm with the MAIB relationship manager before the first payout):**
  1. the Paddle agreement,
  2. a Paddle payout statement or invoice per payout,
  3. the SRL's invoice to Paddle,
  4. possibly a letter explaining the MoR model. Paddle is not the end customer, and payouts aggregate thousands of small sales.
- Also ask MAIB about BNM reporting thresholds for foreign-exchange operations with non-residents, and whether USD receipts must be converted.
- Payout facts from note 06 (VERIFIED there): monthly payouts, USD or EUR by SWIFT to an IBAN, a $15 wire fee per payout, and a 5% + 50¢ transaction fee. See `docs/research/06-payments-moldova.md`.

### 3.5 Does the 7% cover Paddle revenue?

**Yes, for income tax purposes.** The 7% applies to *all* monthly sales revenue, whether eligible or not. Resident Guide p. 25 example: 100,000 MDL eligible (62.01) + 20,000 MDL non-eligible (73.11) → „Impozit unic spre achitare = 8.400 MDL ((100.000 MDL + 20.000 MDL) × 7%)". The single tax replaces corporate income tax (12%), personal income tax on salaries (12%), employer social contributions (24%), employee health insurance (9%), local taxes, real estate tax and road tax (single-tax page).

**Not covered** (Tax Code art. 372(2), per the FAQ):

- VAT,
- excise,
- withholding tax under arts. 88(5), 89, 90, 90¹, 91. MITP's page cites "6% on dividends and 12% on other payments made to non-residents", with lower treaty rates possible,
- social and health contributions on payments to individuals other than salaries.

Which payments by the SRL to foreign vendors attract Moldovan withholding tax is **UNVERIFIED**.

---

## 4. Amendments and end dates (2024 → 2026)

| Date | Act | Effect | Source |
|---|---|---|---|
| Published MO no. 13-16, 12.01.2024; in force 12.02.2024 | Law amending Law 77/2016 | Park term extended from 10 to 20 years. "Extending the state guarantee until 2035 … regardless of any changes in the special tax regime, park residents are assured by the state of keeping the same tax formula for the next 12 years." Park Council created. **Added 82.20 and 78.30, export only.** | <https://mitp.md/amendment-of-the-law-on-it-parks-published-in-the-official-monitor/> |
| Law 125 of 30.05.2024, in force 31.05.2024 | Further amendment to art. 8 | Cited as the current wording of art. 8 in Decision 1/2026. The exact content is **UNVERIFIED**. It probably added the games-only post-production and sound sub-codes (59.12.13, 59.12.17, 59.20.13) that appear in the current list. | Decision 1/2026, p. 6 |
| Government meeting 24.07.2024 | Amendment of HG 1144/2017 | „Termenul de funcționare a MITP a fost stabilit expres la 20 de ani – adică până pe 31 decembrie 2037" (MITP's operating term set expressly at 20 years, i.e. to 31 Dec 2037). Council regulation approved. | <https://mitp.md/ro/modificarea-hg-1144-2017-cu-privire-la-crearea-parcului-pentru-tehnologia-informatiei-moldova-it-park/> |
| 2026 | MITP FAQ | Resident contracts can be extended "up to December 31, 2037". | <https://mitp.md/why-mitp/faq/> |
| 26.02.2026 | MITP press release | "offers a single tax regime of 7% and a stable framework, guaranteed by the state until 2035, with an operating term until 2037." | <https://mitp.md/moldova-innovation-technology-park-announces-an-all-time-record-the-turnover-of-resident-companies-exceeded-usd-1-billion-in-2025/> |
| 12.02.2026 | MITP Decision 1/2026 | 2026 verification methodology. The 70% rule is unchanged; the export-only check is 100% for 82.20 and 78.30. | Decision 1/2026 |

**2025–2026:** no law amendment is announced in MITP's post index since 1 Jan 2025 (checked via the WordPress API; the posts are events, statistics and guides). The 2026 tax calculator still uses 7% and 30% × 17,400 MDL. **UNVERIFIED:** whether the 2026 or 2027 budget and fiscal-policy laws, or any draft law, touch Tax Code Title X or Law 77/2016. I could not read legis.md or search the web. Check before relying on the dates.

**Reading of the dates:**

- The *state guarantee* of an unchanged tax formula runs to **2035**.
- The *park* operates to **31 Dec 2037**.
- For 2036–2037, the regime exists but the guarantee against unfavourable change does not (my inference from MITP's wording).
- The statutory text of the guarantee article was not read (UNVERIFIED).

---

## 5. Practical risks and what to confirm with an accountant

### Risks, ranked

1. **Reclassification of the core product to 78.10 or career services** (§2.4). The whole regime depends on the auditor agreeing that job seekers pay for software. Keep the product, marketing copy, terms of service, invoices and staff job titles consistent with 58.29/63.11.
2. **The monthly cumulative 70% test in early months.** In January or at launch, revenue is small. One affiliate payout, or an employer deal booked in the same month, can push the year-to-date ratio below 70%. Only 2 such months per year are tolerated, and the annual figure must still pass.
3. **Retroactive loss of the regime.** A failed audit means recalculation under the standard regime (12% CIT, payroll taxes and so on) from the breach period, with penalties, plus the cost of rebuilding the books.
4. **VAT surprise.** Exports count toward the 1.2M MDL threshold. Reverse-charge on imported services may already apply (UNVERIFIED).
5. **Paddle gross vs net and the document trail.** Paddle's aggregated payouts don't match the classic contract → invoice → act → payment chain the auditor walks through.
6. **Bank holds on SWIFT receipts** until MAIB gets documents it accepts (§3.4).
7. **Fixed costs even at zero revenue:**
   - the resident fee (150 MDL/month minimum),
   - the annual audit fee (market price UNVERIFIED),
   - the minimum single tax per employee (5,220 MDL/employee/month in 2026). FAQ: with zero revenue a resident still pays "the single tax at the minimum amount established by law".
8. **Founder pay.** Salaries are finally taxed inside the 7%. Dividends carry 6% WHT outside it. How a sole administrator without an employment contract is insured is **UNVERIFIED**.

### Questions for the accountant / MITP (bring this list)

1. Will MITP accept **58.29 and 63.11** for time-limited paid access to a job-search web app used by individuals worldwide? Can we get the classification confirmed in writing before applying?
2. Given the Eligibility Guide's 78.10 reference, what product or marketing features would make an auditor classify pass revenue as employment services? Does Moldovan law require a licence or registration for any job-related online service?
3. Classification of **affiliate commissions from EOR providers** (73.11? 74.90? other?), and whether any structure (for example ad space on our own portal, 63.12.20) could be eligible.
4. Classification of **employer fees**: job-post listings (63.12?) versus introductions and success fees (78.10).
5. **Paddle MoR accounting:** gross or net revenue? What source document replaces the invoice? What will the auditor accept as "confirmarea de la beneficiarul serviciilor exportate" for VAT?
6. **VAT:** place of supply for sales to Paddle (UK); whether and when we must register (1.2M MDL rolling 12 months, exports included); reverse-charge on OpenRouter, hosting and SaaS tools before registration.
7. **Withholding tax** on payments to foreign vendors (OpenRouter, cloud, Paddle fees), and treaty relief with the UK and US.
8. **MAIB:** the exact documents per incoming Paddle SWIFT payout; BNM reporting thresholds; USD account setup; whether a one-off pack (Paddle agreement plus an explanation of the model) avoids per-payout holds.
9. **Minimum single tax with 0 or 1 employees**, and the social-insurance position of a founder-director.
10. The **annual audit** cost, and which firms have audited SaaS or MoR residents.
11. Confirm **no 2025–2026 amendment** to Law 77/2016 or Tax Code Title X (arts. 368–378). Confirm the statutory wording of the 2035 guarantee and the 2037 term.
12. Timing: the regime starts the month after signing. Should the SRL sign before Paddle goes live, so that the first revenue month is already under the 7% regime?

---

## Evidence status summary

| Claim | Status |
|---|---|
| 70% rule wording (Law 77 art. 2; Tax Code art. 368(2)–(3)) | VERIFIED as quoted in MITP Decision 1/2026; not checked against legis.md |
| Monthly cumulative measurement, 2-month tolerance, annual audit by 30 April, no sampling | VERIFIED (Decision 1/2026, Resident Guide, FAQ) |
| Art. 8 code list incl. 58.29, 63.11, 63.12; 82.20 and 78.30 export-only | VERIFIED (Resident Guide pp. 12–13; MITP site) |
| 58.29.40 online software and 63.11.13 SaaS descriptions | VERIFIED (MITP eligibility page) |
| 73.11 marketing non-eligible; 78.10 named as reclassification risk | VERIFIED (Eligibility Guide pp. 16, 24) |
| 78.10 includes online placement agencies in CAEM-2 | UNVERIFIED (NACE Rev. 2 recollection) |
| Affiliate commission classification | UNVERIFIED |
| Single tax covers all revenue; excludes VAT, WHT, excise | VERIFIED (FAQ; Resident Guide p. 25) |
| VAT threshold 1.2M MDL incl. exports; export confirmation per art. 102(15) | VERIFIED (Resident Guide pp. 34, 39) |
| Place of supply and reverse-charge rules for Pemby | UNVERIFIED |
| MAIB and BNM document requirements | UNVERIFIED (only MAIB's document-request line verified) |
| Paddle gross vs net treatment | UNVERIFIED (audit methodology point 8(c) VERIFIED) |
| State guarantee to 2035, park term to 31.12.2037, contracts extendable to 2037 | VERIFIED (MITP news 2024, FAQ, Feb 2026 release); statutory text not read |
| No 2025–2026 amendments | UNVERIFIED beyond mitp.md |
