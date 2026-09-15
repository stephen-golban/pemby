# 12 — Juniors and internships: where they get hired, and where Pemby can source the listings

Researched 2026-09-15. Question: can Pemby keep its promise ("only jobs that can actually hire you") for juniors and internship seekers in Moldova and similar countries? Where do those people realistically get hired, and which listing sources can Pemby read legally?

**Method.** I read program pages, board robots.txt files and terms, and official APIs. I also ran my own counts against public APIs on 2026-09-15: Greenhouse, SmartRecruiters, Lever, Ashby, Himalayas, Remotive, and HN Algolia. The web-search quota was exhausted before this note began, so every source below was fetched directly. Reddit posts came from the Arctic Shift archive API. Some pages returned 403 or 404, or timed out. Those gaps are marked **UNVERIFIED**.

**Evidence grades** (same scheme as `01-job-seeker-pain-points.md`)

- **[A]** First-party page, dataset or API, read at the source.
- **[count]** My own count from a public API or page on 2026-09-15. It is reproducible but is a single-day snapshot, so treat it as an estimate of the share, not a trend.
- **[B]** A first-party number reported by a secondary outlet.
- **[C]** Anecdote: one post or comment.
- **UNVERIFIED**: not confirmed at a primary source.

---

## 1. How scarce are junior roles?

### 1.1 Market-wide (mostly US data)

- US tech postings, February 2025 against February 2020: standard/junior tech titles were **down 34%** and senior/manager titles **down 19%**. Among postings that state an experience requirement, the share asking for 5+ years rose from **37% to 42%** (Q2 2022 to Q2 2025). The 2–4 year share fell from 46% to 40%, and the "1 year or less" share held at about **18%** (17% to 18%). [A] <https://hiringlab.indeed.com/2025/07/30/experience-requirements-have-tightened-amid-the-tech-hiring-freeze/>
- **71%** of the increase in US software development postings between May 2025 and May 2026 came from senior roles. Software postings are still about **27.5% below** pre-pandemic levels. This article gives no entry-level share. [A] <https://hiringlab.indeed.com/2026/07/08/ai-and-job-postings-from-destruction-to-creation/>
- New grads made up **7% of Big Tech hires** and **under 6% of startup hires** in 2024. That is down 25% and 11% from 2023, and more than 50% and more than 30% from 2019. The data comes from SignalFire's own Beacon platform. [A] <https://www.signalfire.com/blog/signalfire-state-of-talent-report-2025>
- Employment of workers aged 22–25 in AI-exposed occupations such as software development is **19% below** where it would be had it kept pace with less-exposed peers. This is US ADP payroll data through June 2026. The authors say the gap works "primarily through reduced hiring of young workers". [A] <https://digitaleconomy.stanford.edu/publications/canaries-in-the-coal-mine/>
- Recent US college graduates, 2026 Q2: **5.6%** unemployment and **42%** underemployment. The page text gives no CS-specific figure. [A] <https://www.newyorkfed.org/research/college-labor-market>
- Outside the US: Rest of World cites EY for a **20–25%** cut in entry-level roles at Indian IT services firms, and cites LinkedIn, Indeed and EURES for a "**35% decline in junior tech positions**" across major EU countries in 2024. [B], primary reports not opened, **UNVERIFIED**. <https://restofworld.org/2025/engineering-graduates-ai-job-losses/>
- An r/csMajors post titled "Entry-level job posts in tech are only 4%" (2026-09) is an image with no stated source. **UNVERIFIED**, do not cite as a statistic. <https://www.reddit.com/r/csMajors/comments/1wdji8q/entrylevel_job_posts_in_tech_are_only_4/>

### 1.2 Remote boards: junior roles that are also open internationally

- **Himalayas API** [count]. I sampled the newest 2,000 of 104,893 listings, published 2026-09-14 to 2026-09-15. API: <https://himalayas.app/jobs/api>
  - **280 of 2,000 (14%)** carry the `Entry-level` seniority tag. Tags can overlap.
  - Only **10 of those 280** have no `locationRestrictions`, i.e. worldwide. That is **0.5% of all sampled jobs** and 3.6% of entry-level jobs.
  - **133 of 280** entry-level jobs are restricted to the United States.
  - `employmentType = Intern`: **30 jobs, 4 of them worldwide**.
  - For comparison, only 43 of all 2,000 sampled jobs (2.2%) had no location restriction.
  - Caveat: `02-location-eligibility.md` notes that Himalayas shows jobs with no location data in every country filter. That makes "worldwide" here an upper bound. Its API terms also ban redistribution (see `03-competitors-and-automation.md`).
- **Remotive API**, software-dev category [count]: 15 jobs returned, **0** with junior, intern, entry or graduate in the title. <https://remotive.com/api/remote-jobs?category=software-dev>
- **HN "Who is hiring?"** [count, keyword regex over top-level posts via HN Algolia]. This is an estimate: keyword hits are not role counts.
  - **September 2026:** 264 posts. **21** mention junior, intern(ship), new grad or entry-level. Only **2** of those also say remote together with worldwide, anywhere or global. <https://news.ycombinator.com/item?id=49522897>
  - **August 2026:** 234 posts. "junior" appears in 3, "intern" in 4, "new grad/entry-level" in 5. Only **1** junior-ish post was remote and worldwide. <https://news.ycombinator.com/item?id=49156683>
  - The September junior posts are mostly on-site or country-locked. Examples: Mechanize, Junior SWE, "San Francisco, CA (Onsite)" <https://news.ycombinator.com/item?id=49524060>. Robotics and AI Institute, intern, "ONSITE (Zürich) … No visa sponsorship" <https://news.ycombinator.com/item?id=49533419>. FitMate, Junior Frontend, "REMOTE (US)" <https://news.ycombinator.com/item?id=49531439>. The one clear worldwide junior post is Deeter Analytics, "REMOTE (WORLDWIDE) … One junior ML engineer" <https://news.ycombinator.com/item?id=49571280>.

### 1.3 Regional boards: the junior share is higher

- **DOU (Ukraine)** [count]: **635** "vacancies for beginners" (`exp=0-1`) out of **5,879** total, i.e. **10.8%**. Of the beginner roles, **218 (34%)** are remote, against **3,067 of 5,879 (52%)** remote overall. Beginners are much less likely to be remote. "Remote" on DOU usually means remote within Ukraine, not open internationally. <https://jobs.dou.ua/vacancies/?exp=0-1>
- **Djinni (Ukraine)** [count]: **463** "no experience" jobs, **316** of them full remote. I could not read a site-wide total. <https://djinni.co/jobs/?exp_level=no_exp>, <https://djinni.co/jobs/?exp_level=no_exp&employment=remote>
- **rabota.md (Moldova)**: **631** jobs in "IT, Programare". Visible examples include "Junior PHP/Java/C# Developer" and "Internship IT". The board has a "Se acceptă fără experiență" (no experience accepted) filter. [A] <https://www.rabota.md/ro/vacancies/category/it>
- **delucru.md (Moldova)**: **305** IT jobs on the homepage and **286** on the category page, both on the same day. Filters exist for "Fără Experiență", "Elevi" (pupils), "Studenți" and "Entry-Level (< 2 ani)". Visible junior roles include Unifun "IT Internship", Unifun "Junior PHP Developer" (from 800 USD, Chișinău) and FXBITS "Junior Java Developer" (Bălți). [A] <https://www.delucru.md/jobs/it-software>

### 1.4 ATS boards of companies that hire in the region [count, 2026-09-15]

| Company | ATS / endpoint | Total | Junior or intern roles | Notes |
|---|---|---|---|---|
| Endava | SmartRecruiters `api.smartrecruiters.com/v1/companies/Endava/postings` | 189 | 3 "Entry Level" and 4 "Associate" labels; 11 junior-titled (Vietnam, India, UK) | **0 postings in Moldova**; 106 in Romania |
| Amdaris | Greenhouse EU `boards-api.greenhouse.io/v1/boards/amdaris/jobs` | 14 | 0 | 3 in Chișinău, all Senior, Principal or Architect |
| Canonical | Greenhouse `boards/canonical` | 304 | ~12 real early-career roles | Several are "Home based - Worldwide" (see §2.1) |
| GitLab | Greenhouse `boards/gitlab` | 223 | 0 | Regex hits were "Associate…" and "Internal…" false positives |
| Mozilla | Greenhouse `boards/mozilla` | 69 | 0 | — |
| Wikimedia | Greenhouse `boards/wikimedia` | 17 | 0 | Its entry path is GSoC and Outreachy (§2.2) |

**Takeaway.** Junior roles that are remote *and* legally open to a Moldovan are rare. Junior roles as a whole are not.

- In the Himalayas sample, 14% of jobs are entry-level, but only 0.5% are entry-level and worldwide [count].
- On HN, about 8% of September posts mention junior roles, but 2 of 264 are also remote-worldwide [count].
- On local boards, a 10–11% beginner share (DOU) and hundreds of local IT jobs (rabota.md, delucru.md) show that junior hiring exists, but it is mostly local.

---

## 2. Programs genuinely open to candidates from Moldova and similar countries

Today is 2026-09-15. Dates in the past are marked as such.

### 2.1 Employer programs (remote)

| Program | Eligibility | Pay | Timing | URL |
|---|---|---|---|---|
| **Canonical: Graduate Software Engineer (Ubuntu)** | "Home based - Worldwide". First bachelor's degree completed or expected in 2025 or 2026 in CS, Informatics, Maths or STEM. "Exceptional academic track record from both high school and university". Travel to company events twice a year | Not disclosed. "We consider geographical location…"; $2,000 yearly learning budget | Rolling; posting updated 2026-08-24 | [A] <https://job-boards.greenhouse.io/canonical/jobs/8142329> |
| Canonical: other worldwide early-career roles | Home based - Worldwide | Not disclosed | Open 2026-09-15 | [A] Junior Ubuntu Software Engineer <https://job-boards.greenhouse.io/canonical/jobs/6707669>; Junior Linux Kernel Engineer <https://job-boards.greenhouse.io/canonical/jobs/5370815>; Associate Linux Support Engineer <https://job-boards.greenhouse.io/canonical/jobs/6448444>; Ubuntu Sales Engineer (Entry-Level) <https://job-boards.greenhouse.io/canonical/jobs/5643282> |
| **Automattic** | Remote-first: "1,421 Automatticians in 83 countries". No internships mentioned on the hiring page | — | — | [A] <https://automattic.com/work-with-us/> |
| **GitLab, Mozilla, Wikimedia** | 0 intern or junior roles on their public Greenhouse boards on 2026-09-15 [count] | — | Seasonal intern cohorts possible; **UNVERIFIED** | Greenhouse boards above |
| **Toggl** | Not checked | — | — | **UNVERIFIED** |
| **MLH Fellowship** | 18+, living in a non-embargoed country, English proficiency. Must have joined at least one MLH hackathon or Global Hack Week. ~20 h/week. The Production Engineering track is limited to the US, Canada and Mexico | "university credits or an educational stipend"; amount not stated | Batch dates not published in the FAQ | [A] <https://fellowship.mlh.com/>, FAQ <https://docs.google.com/document/d/e/2PACX-1vQ4m8tMZKfc9ZvwGXOGJOUkfGHHVpQsaLfwA2Ky1gpjK_8B9jltbs5H8jCfOS_1M-eBGmymiZL_n0TT/pub> |

### 2.2 Paid open-source mentorship programs

| Program | Eligibility | Pay for Moldova (and peers) | Timing | URL |
|---|---|---|---|---|
| **Google Summer of Code** | 18+. "Student or Open source beginner"; not a regular contributor (fewer than 10 issues or PRs). Accepted at most once before. Not in a US-embargoed country; Russia, Belarus and DNR/LNR excluded; Ukraine outside DNR/LNR eligible. ~90, 175 or 350 hours | PPP-adjusted with a floor. **Moldova, Ukraine, Georgia, Armenia, Serbia, Brazil, Nigeria and India all get the minimum**: $750 small, $1,500 medium, $3,000 large | 2026 (past): orgs announced Feb 19; **contributor applications Mar 16–31**; coding from May 25; standard end Aug 24; extended end Nov 2. **2027 dates not published.** The page says orgs usually open in January and are announced in February | [A] <https://developers.google.com/open-source/gsoc/timeline>, <https://developers.google.com/open-source/gsoc/help/student-stipends>, <https://developers.google.com/open-source/gsoc/faq> |
| GSoC 2026 orgs relevant to "GNOME/KDE/Apache" | 183 orgs, including GNOME Foundation, KDE Community, Apache Software Foundation, Wikimedia Foundation, Python Software Foundation, Django, Debian, CNCF, The Linux Foundation, Rust Foundation, LLVM, Jenkins and OpenStreetMap [count] | via GSoC | via GSoC | [A] <https://summerofcode.withgoogle.com/api/program/2026/organizations/> |
| **Outreachy** | "Open to applicants around the world". 18+. 30 h/week for 13 weeks. No other job or internship during it. Never before an Outreachy or GSoC intern. Essays must show "lived experience with underrepresentation, discrimination, and systemic bias" **in the tech industry of the applicant's country**. No prior open-source experience needed | **$7,000** flat | December 2026 cohort: initial applications **Aug 24–31 (closed)**; contribution period Oct 5–Nov 2; interns announced Nov 30; internship **Dec 7, 2026–Mar 8, 2027**. May 2027 cohort dates **not published** | [A] <https://www.outreachy.org/docs/applicant/> |
| **LFX Mentorship** (Linux Foundation, CNCF, etc.) | Anyone except residents of Russia, Belarus and DNR/LNR; Ukraine outside DNR/LNR eligible | PPP-based: base $6,000, minimum $1,000, maximum $6,600. For programs starting on or after 2026-07-01: **Moldova $2,600**, Ukraine $1,600, Georgia $2,000, Armenia $2,400, Serbia $2,600, India $1,300, Nigeria $1,000, Brazil $3,100. Paid 50% at midterm and 50% at completion, via Expensify | Three terms a year: **Spring Mar 1–May 31** (applications mid-January), **Summer Jun 1–Aug 31** (mid-April), **Fall Sep 1–Nov 30** (mid-July). Mentee applications open ~4 weeks before a term. Fall 2026 has already started | [A] <https://docs.linuxfoundation.org/lfx/mentorship/mentee-guide/mentee-faqs.md>, <https://docs.linuxfoundation.org/lfx/mentorship/mentee-stipends/total-stipend-amount.md>, term dates via <https://docs.linuxfoundation.org/lfx/mentorship/mentee-guide/introduction.md> |

Note: LFX pays a Moldovan more than GSoC does ($2,600 for 12 weeks full-time, against $750–$3,000). [A] sources above.

### 2.3 Local and regional trainee and academy programs (Moldova)

| Program | What the primary source says | Status |
|---|---|---|
| **Endava junior programmes** | Internship programme listed for **Colombia and Vietnam** (10 weeks in Vietnam). Graduate Programme: "no openings". Dava.X Academy: "no roles currently available". Moldova not mentioned. SmartRecruiters shows 0 Moldova postings (§1.4) | [A] <https://www.endava.com/careers/early-careers/junior-programmes>. A Moldova program is **UNVERIFIED / not found** |
| **AROBS Junior Academy** | Internship page with a CV form. Pay, duration and dates not disclosed. Moldova not named on the page, though AROBS lists offices in Moldova | [A] <https://arobs.com/careers-at-arobs/arobs-junior-academy-internship/>. Moldova intake **UNVERIFIED** |
| **Tekwill Academy** | Paid courses for adults, e.g. "Data Analytics with Excel, Power BI & SQL", 60 h, **7,000 MDL**. Claims 5,500+ graduates, and lists Pentalog, Endava, Orange Systems, Cegeka and ISD Moldova as graduate employers. It is training, not a paid internship | [A] <https://tekwillacademy.md/> |
| **Tekwill (ATIC) programmes** | Tekwill Junior (school pupils, C and databases with Certiport), Tekwill Academy Kids, women's inclusion programme. Reports 718,232 participants and "2,572 employment opportunities". No dates or pay | [A] <https://tekwill.md/>, <https://tekwill.md/tekwill-junior/>, <https://tekwill.md/women/> |
| **Unifun** (via delucru.md) | Live "IT Internship", "IT Product Manager Internship", "Junior PHP Developer" (from 800 USD) and "Junior IT Product Manager" (800 USD), all in Chișinău | [A] <https://www.delucru.md/jobs/it-software> (a snapshot) |
| **Amdaris** | Greenhouse board has 3 Chișinău roles, all senior. No academy page found (`/academy` 404) | [count] above. Academy **UNVERIFIED** |
| **Pentalog** (now part of Globant), **Ebs Integrator**, **Orange Systems** | Sites timed out, or no internship or academy page found (ebs-integrator.com `/en/academy` and `/en/internship` returned 404) | **UNVERIFIED** |

---

## 3. Local job sources: API, RSS, terms, robots.txt, IT volume

| Source | API / RSS | robots.txt (fetched 2026-09-15) | Terms on scraping and reuse | IT volume |
|---|---|---|---|---|
| **rabota.md** (MD) | No public API found; `/rss` returns 404 | `Crawl-delay: 2`. Disallows `/auth`, `/cabinet`, `/applicant`, `/ajax`, resumes, login. Vacancy pages allowed | A keyword scan of `/ro/rules` found **no scraping clause**. It **bans ads "which involve collecting payments from candidates for employment"** and bans chat-bots between the parties. Operator: an SRL, IDNO 1017600013007 | 631 IT jobs |
| **jobs.md** (MD) | — | robots.txt returned Cloudflare 526 | Homepage links to rabota.md's `/agreement` and `/rules`, so likely the same operator (**UNVERIFIED**) | — |
| **lucru.md** (MD) | — | Byte-identical to rabota.md's | Same `/ro/agreement` and `/ro/rules` structure; likely the same platform (**UNVERIFIED**) | — |
| **delucru.md** (MD) | `/api/` disallowed; `/rss` returns 404 | Disallows all query strings, `/api/`, `/ajax/`, `/employer/`, `/jobseeker/` | **Explicit ban**: "extragerea automatizată, monitorizarea sistematică sau reutilizarea conținutului" (automated extraction, systematic monitoring or reuse). Also bans "roboți, crawlere, scripturi … fără acordul scris" (robots, crawlers, scripts … without written consent). Operator: EUROACORD DIGITALIZATION AND EDUCATION | 286–305 IT jobs |
| **DOU jobs** (UA) | **Official RSS** at `jobs.dou.ua/vacancies/feeds/`, filterable (e.g. `?category=Python`, `?exp=0-1`), 25 items per feed with title, link, description and pubDate | Allows `/vacancies/`; blocks some bots entirely | §2.5 bans "automatic collection of information … without the consent of the Administration". User content is CC **BY-NC-SA** (non-commercial) | 5,879 jobs; 635 for beginners |
| **Djinni** (UA) | RSS at `djinni.co/jobs/rss/` returns valid RSS | Disallows `/jobs2`, `/q`, `/developers`, `/free-jobs`; `/jobs/` allowed | Terms page not found (`/terms` 404) → **UNVERIFIED** | 463 no-experience jobs |
| **hr.ge** (GE) | Sitemap served from `api.p.hr.ge/public-portal/...` (JSON backend, undocumented) | `Allow: /` | Terms are a PDF (`WEB_Standard_Service_Terms_ka.pdf`), not read → **UNVERIFIED** | Not measured |
| **jobs.ge** (GE) | Homepage links RSS feeds (`/rss/jobs/`, `/rss/trainings/`), but a fetch returned HTML, not RSS → **UNVERIFIED** | `Crawl-delay: 5`; disallows `/data/clients/` | Not found → **UNVERIFIED** | Not measured |
| **staff.am** (AM) | `/rss` returns 404 | Cloudflare content signals: `search=yes, ai-train=no, use=reference`. **Blocks ClaudeBot, GPTBot, CCBot** and others | **Explicit ban** on "spiders, robots … to navigate or search", on "Aggregate, copy, or duplicate", and on "scrape, strip, or mine data" | Not measured (403) |
| **HelloWorld.rs** (RS) | **RSS** at `/rss/` (15 items) | Allows almost everything | Terms not found → **UNVERIFIED** | Not measured |
| **Joberty** (RS and region) | Sitemap only | `Disallow:` (empty, so everything allowed) | Terms not found → **UNVERIFIED** | Not measured |
| **hh.ru** | Official API at api.hh.ru/dev.hh.ru not fetched this session → **UNVERIFIED** | Disallows `/rss/*`; Googlebot blocked from query strings | — | — |
| work.ua / robota.ua (UA, general boards) | — | work.ua explicitly allows `/*/?*student=`; robota.ua sits behind a Cloudflare challenge | Not read | — |

Sources: robots.txt at `<domain>/robots.txt` for each row; terms at <https://www.delucru.md/terms-conditions>, <https://www.rabota.md/ro/rules>, <https://dou.ua/legal/>, <https://staff.am/terms-of-use>; feeds at <https://jobs.dou.ua/vacancies/feeds/?exp=0-1>, <https://djinni.co/jobs/rss/>, <https://www.helloworld.rs/rss/>.

**Reading of the legal position (not legal advice).** robots.txt allowing a path is not a license. Where terms ban automated collection (delucru.md, staff.am, DOU without consent), Pemby needs written permission or a partnership. Two channels look like intended syndication: DOU's filterable RSS and HelloWorld.rs's RSS. Even so, DOU's terms and CC BY-NC-SA mean commercial reuse needs consent. The cleanest pattern is **link-out with title only, plus a written OK**, or an employer-posts-directly model.

### Do Moldovan IT companies use readable ATS boards? [count]

- **Yes, a few.** Amdaris runs a public Greenhouse EU board with Chișinău roles (<https://job-boards.eu.greenhouse.io/amdaris>). Endava uses SmartRecruiters' public Posting API, but it had no Moldova postings on 2026-09-15. Devexperts has 36 SmartRecruiters postings (locations not checked). Preply (Ukraine roots) is on Ashby.
- **No hit on Greenhouse, Lever, Ashby or SmartRecruiters** for the slugs I guessed: pentalog, arobs, ebsintegrator, orangesystems, cedacri, iute, maib, moldcell, starnet, unifun, stefanini, simpals, scopic, computools, alliedtesting. Slug guessing is not exhaustive; Workday, Teamtailor, BambooHR and in-house portals were not probed.
- The Moldovan junior roles I found (Unifun, FXBITS) appear on **local boards**, not on public ATS APIs.

---

## 4. Does "on-site or hybrid in your own country" need to be a Pemby way of working?

Evidence for yes:

1. **Juniors are the least remote segment.** On DOU, 34% of beginner roles are remote against 52% of all roles [count, §1.3]. Nearly half of Himalayas entry-level jobs are US-only, and 10 of 280 are worldwide [count, §1.2]. HN junior posts are mostly on-site in SF, Zürich, Oxford or Noida [count, §1.2].
2. **Local junior demand exists and is visible.** rabota.md lists 631 IT jobs and delucru.md about 300, with junior and internship listings and a "no experience" filter [A, §1.3].
3. **Regional employers' ATS boards skew senior** for Moldova. Amdaris's Chișinău roles are 3 of 3 senior, and Endava has 0 Moldova roles [count, §1.4]. ATS-only sourcing would show a Moldovan junior almost nothing.
4. **The early-career programs that are open internationally are either remote-by-design** (GSoC, Outreachy, LFX, MLH, Canonical graduate roles) **or local** (Unifun internships, Tekwill-linked employers). Almost nothing sits in between.

Counterpoint: Djinni lists 316 of 463 no-experience jobs as remote [count]. That is mostly remote within Ukraine, so a Moldovan or Georgian candidate may still be excluded (**UNVERIFIED** share). A local mode must be country-scoped, not just "remote".

Conclusion: yes. Juniors need **"Local: on-site or hybrid in your country/city"** added to B2B contractor, EOR employee, relocation with visa, and freelance. They also need a fifth non-job type: **"Program: stipend, fixed cohort"** (GSoC, Outreachy, LFX, MLH). Those are not employment and have hard deadlines.

---

## 5. What juniors complain about

- **"Entry-level" that demands years of experience.**
  - "every entry-level job wants 2-3 years of experience … applied to something like 150 jobs". r/csMajors, 2026-07, score 188 [C] <https://www.reddit.com/r/csMajors/comments/1v9x99h/my_niece_just_graduated_and_every_entrylevel_job/>
  - "There are no entry-level jobs, because 'entry level' now requires years of experience". HN, 2025-10 [C] <https://news.ycombinator.com/item?id=45445419>
  - "Worst job market right now for people with less then 2 years of experience". r/csMajors, 2026 [C] <https://www.reddit.com/r/csMajors/comments/1uqbyb0/worst_job_market_right_now_for_people_with_less/>
  - The data behind it: the 5+ years share rose to 42% [A] (§1.1).
- **Volume and silence (ghosting).**
  - "214 applications since june 2. four human replies". A May 2026 CS graduate, r/cscareerquestions, 2026-09, score 245 [C] <https://www.reddit.com/r/cscareerquestions/comments/1wbr3vi/entry_level_dev_jobs_down_20_what_are_you_all/>
  - "I made a free 1-page ATS audit checklist after getting ghosted by 20 applications". r/cscareerquestions [C] <https://www.reddit.com/r/cscareerquestions/comments/1u5387m/i_made_a_free_1page_ats_audit_checklist_after/>
  - Market-wide, 61% of job seekers were ghosted after an interview (Greenhouse, December 2024). Carried over from note 01, not re-fetched here. <https://www.greenhouse.com/blog/greenhouse-2024-state-of-job-hunting-report>
- **AI screening and AI replacing junior work.**
  - Only 8% of job seekers think AI screening makes hiring fairer (Greenhouse, November 2025). Carried over from note 01, not re-fetched. <https://www.greenhouse.com/newsroom/an-ai-trust-crisis-70-of-hiring-managers-trust-ai-to-make-faster-and-better-hiring-decisions-only-8-of-job-seekers-call-it-fair>
  - "my manager was going to hire a junior developer and ended up getting a pro subscription to Claude instead". HN, 2025-09 [C] <https://news.ycombinator.com/item?id=45385906>
  - Heavily discussed HN stories: "AI is hitting entry-level jobs hardest, Stanford study finds" (2026-08, 145 points) <https://news.ycombinator.com/item?id=49435147>; "AWS CEO says using AI to replace junior staff is 'Dumbest thing I've ever heard'" (2025-08, 1,697 points) <https://news.ycombinator.com/item?id=44972151>; "IBM tripling entry-level jobs after finding the limits of AI adoption" (2026-02, 378 points) <https://news.ycombinator.com/item?id=47009327> [C].
  - For the 19% employment gap for ages 22–25, see §1.1 [A].
- **Scams aimed at juniors: fake paid internships, deposits, "pay for training".**
  - FTC: "Honest employers … will never ask you to pay to get a job". Scammers ask payment for "starter kits", "training programs", "certifications" and "equipment". [A] <https://consumer.ftc.gov/articles/job-scams>
  - Task-scam reports rose to about 20,000 in H1 2024, and job-scam losses exceeded $220M in H1 2024 (FTC, 2024-12-12). Carried over from note 01, not re-fetched. <https://www.ftc.gov/news-events/news/press-releases/2024/12/new-ftc-data-show-skyrocketing-consumer-reports-about-game-online-job-scams>
  - A work-from-home internship paying "₹14,000/month" then asked for a refundable "collateral/security deposit". r/recruitinghell, 2026-05 [C] <https://www.reddit.com/r/recruitinghell/comments/1t1ij88/is_this_internship_a_scam_theyre_asking_for_money/>
  - "Massive Internship Scam by 'Coorix'. They made 80 of us join a 'Final Interview' just to ask for money!" (post body removed). r/recruitinghell, 2026-09 [C] <https://www.reddit.com/r/recruitinghell/comments/1w5d7jh/massive_internship_scam_by_coorix_they_made_80_of/>
  - "'Paid Internship' Scam must be called out!" [C] <https://www.reddit.com/r/recruitinghell/comments/1t4cwbc/paid_internshipscam_must_be_called_out/>; "I almost got scammed by a fake ed-tech internship (Zyntiq)" [C] <https://www.reddit.com/r/recruitinghell/comments/1tbxn7r/i_almost_got_scammed_by_a_fake_edtech_internship/>
  - "Looking for Legit Remote IT Internship (Not a Scam)". The demand signal is trust. r/cscareerquestions [C] <https://www.reddit.com/r/cscareerquestions/comments/1re9rrl/looking_for_legit_remote_it_internship_not_a_scam/>
  - A cold-contact pattern that targets "people trying to break into … entry level" roles. HN, 2025-01 [C] <https://news.ycombinator.com/item?id=42699865>
  - Fake recruiters hiding malware in coding challenges (HN, 2026-02). Carried over from note 01. <https://news.ycombinator.com/item?id=47030847>
  - Local rule worth copying: rabota.md bans ads "which involve collecting payments from candidates" [A] <https://www.rabota.md/ro/rules>.
- Moldova-specific complaint data (local forums, Telegram, 999.md): **not researched, UNVERIFIED gap.**

---

## What I did not verify

- Toggl, GitLab, Mozilla and Wikimedia seasonal intern cohorts. Their boards show none today, but cohorts may open at other times.
- May 2027 Outreachy dates and GSoC 2027 dates.
- MLH stipend amounts and batch dates.
- Terms for Djinni, jobs.ge, hr.ge, HelloWorld.rs and Joberty.
- Whether rabota.md, jobs.md and lucru.md share an operator.
- The hh.ru API terms.
- IT volume on hr.ge, jobs.ge, staff.am, HelloWorld.rs and Joberty.
- Moldova intakes for Endava, AROBS, Pentalog, Ebs Integrator and Orange Systems.
- The three Greenhouse and FTC figures carried over from note 01 were not re-fetched.

---

## Product implications for Pemby

1. **Add two ways of working for juniors.** "Local: on-site or hybrid in my country/city" is where most junior hiring happens: DOU beginners are 34% remote against 52% overall, and 10 of 280 Himalayas entry-level jobs are worldwide. "Program: stipend cohort" covers GSoC, Outreachy, LFX and MLH, which are not jobs and pay by country.
2. **Add sources in order of legal cleanliness.** First, public ATS APIs already in scope, plus Canonical's worldwide graduate and junior roles and Amdaris's Greenhouse EU board. Second, official program pages and APIs (GSoC org API, LFX docs, Outreachy). Third, DOU's filterable RSS (`exp=0-1`) and HelloWorld.rs's RSS, **with written consent** because DOU bans automated collection and licenses content non-commercially.
3. **Do not scrape delucru.md or staff.am.** Both ban it explicitly, and staff.am blocks AI crawlers. Ask rabota.md and delucru.md for a feed or partnership, since they hold the Moldovan junior volume (631 and ~300 IT jobs). Until then, a let-employers-post-directly flow is the safe route to local listings.
4. **Don't rely on ATS-only sourcing for Moldovan juniors.** Regional ATS boards skew senior (Amdaris Chișinău 3 of 3 senior, Endava 0 Moldova roles). ATS alone would produce near-total silence for a Chișinău junior.
5. **Keep the match bar strict on eligibility and loosen it on experience.** Eligibility (country, work mode, program residency rules) stays binary. Experience should tolerate stated requirements up to about 2 years for "entry-level" titles, because postings inflate them. Label the gap honestly ("asks 2 years; entry-level title") rather than hiding the job.
6. **Make "honest silence" constructive for juniors.** With 0.5% of remote jobs being entry-level and worldwide, a silent feed is the norm. Silence should come with the next real options: open program windows, local listings in the user's city, and the date the next cohort opens.
7. **Build the programs calendar; the evidence supports it.** The windows are fixed and short. LFX applications open mid-January, mid-April and mid-July for Mar 1, Jun 1 and Sep 1 terms. GSoC contributor applications ran Mar 16–31 in 2026, with orgs announced in February. Outreachy's December cohort applications ran Aug 24–31. Send alerts about 4 weeks before a window opens. Show per-country pay (LFX Moldova $2,600, GSoC Moldova $750–$3,000, Outreachy $7,000) and eligibility traps (GSoC excludes regular OSS contributors; Outreachy needs underrepresentation essays and excludes past GSoC interns).
8. **Treat scam defense as a core junior feature.** Never list anything that charges candidates, as rabota.md's rules already require. Flag deposits, "training fees", paid certifications, and unsolicited internship offers per the FTC's guidance. Show a verified-source badge (ATS API, official program page) on every early-career listing.
9. **Keep juniors a filtered view, not a separate product.** Seniority is already a field in the sources (Himalayas `seniority`, SmartRecruiters `experienceLevel`, DOU `exp=0-1`, Djinni `exp_level=no_exp`). Map those fields to one Pemby level instead of keyword-guessing titles, which gave false positives like "Internal Auditor" in my counts.
