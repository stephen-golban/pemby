# 01 — Job seeker pain points (software / IT), 2025–2026

Researched 2026-09-15. Question: what do software and IT job seekers actually complain about, how common is each problem, and which problems are still unsolved enough to build a product around?

**Method.** I read first-party survey releases (Greenhouse, Robert Half, American Staffing Association/Harris Poll, Resume Builder), labor-market data (Indeed Hiring Lab, FRED), regulator and court material (FTC, the Ontario government, reporting on *Mobley v. Workday*), and security vendor reports (Microsoft). For voices, I pulled Hacker News threads and comments through the HN Algolia API and Reddit posts through the Arctic Shift archive API. Reddit blocks direct fetches, and the archive rate-limited me after one pass, so **Reddit coverage is thinner than HN coverage.** Some publisher pages returned HTTP 403. Where a number comes only from a search-engine summary of such a page, it is marked **[unverified]**.

**Evidence grades used below**

- **[A]** First-party survey or dataset, read at the source, with method stated.
- **[B]** A first-party number reported by a secondary outlet, or a first-party page I could not open directly.
- **[C]** Anecdote: a single post, comment or first-person account. It shows what the complaint sounds like, not how common it is.
- **[old]** Evidence from before 2025. Included only where nothing newer was found.

**Caveat on geography.** Almost all the quantitative data is US-centric (some UK, Ireland, Germany). None of it is specific to Eastern Europe or to candidates without EU/US work authorization. The founder's own segment is under-measured.

---

## 0. Market context (why the pain is sharper now)

- US software development postings on Indeed were still **27.5% below their February 2020 level** in June 2026, while overall postings were roughly back to baseline. [A] <https://hiringlab.indeed.com/2026/07/08/ai-and-job-postings-from-destruction-to-creation/>
- The FRED copy of the same Indeed index read **76.12 on 2026-09-04** (Feb 2020 = 100). [A] <https://fred.stlouisfed.org/series/IHLIDXUSTPSOFTDEVE>
- The recovery is senior-skewed: **71% of the net increase** in US software postings between May 2025 and May 2026 was senior roles, and 37% came from roles with AI in the title. [A] <https://hiringlab.indeed.com/2026/07/08/ai-and-job-postings-from-destruction-to-creation/>
- Experience bars rose between Q2 2022 and Q2 2025. Among tech postings that state an experience requirement, the share asking for 5+ years went from **37% to 42%**, and the 2–4 year share fell from 46% to 40%. As of February 2025, junior/standard tech titles were down 34% from 2020, against 19% for senior/manager titles. [A] <https://hiringlab.indeed.com/2025/07/30/experience-requirements-have-tightened-amid-the-tech-hiring-freeze/>
- Trust is low. **46%** of US job seekers say their trust in hiring fell over the past year, and 42% blame AI (Greenhouse, 4,136 respondents in the US, UK, Ireland and Germany, published 2025-11-19). [A] <https://www.greenhouse.com/newsroom/an-ai-trust-crisis-70-of-hiring-managers-trust-ai-to-make-faster-and-better-hiring-decisions-only-8-of-job-seekers-call-it-fair>
- **79%** of workers report heightened anxiety about the job market (Greenhouse, 2,500 workers in the US, UK and Germany, December 2024). [A] <https://www.greenhouse.com/blog/greenhouse-2024-state-of-job-hunting-report>

Implication: a 7-year engineer like the founder sits in the segment where demand is recovering. The problems below are about *friction and signal*, not a total absence of jobs.

---

## 1. Ghost jobs and stale postings

### How widespread

- Greenhouse classifies **18–22% of jobs posted on its own platform** as ghost jobs in any given quarter. **60%** of candidates suspect they have met one (December 2024). [A] <https://www.greenhouse.com/blog/greenhouse-2024-state-of-job-hunting-report>
- **69%** of US job seekers say they have encountered fake job postings (Greenhouse, November 2025). [A] <https://www.greenhouse.com/newsroom/an-ai-trust-crisis-70-of-hiring-managers-trust-ai-to-make-faster-and-better-hiring-decisions-only-8-of-job-seekers-call-it-fair>
- On the employer side, **40%** of companies say they posted a fake listing in the past year and **30%** have one live now. **70%** of those managers call the practice morally acceptable. Stated motives include appearing to grow (66%), making staff feel replaceable (62%) and collecting résumés (59%). Resume Builder surveyed 649 hiring managers via Pollfish on 2024-05-22. [A][old] <https://www.resumebuilder.com/3-in-10-companies-currently-have-fake-job-posting-listed/>
- Ghost/fake jobs rank as job seekers' **second-biggest challenge (39.9%)**, after employer ghosting (iHire/Harris Poll, *State of Online Recruiting 2025*). [B][unverified: page returned 403] <https://www.ihire.com/resourcecenter/employer/pages/the-state-of-online-recruiting-2025>
- Regulators now treat this as real:
  - **Ontario** (in force 2026-01-01) requires employers with 25+ employees to state whether a posting is for an existing vacancy, disclose AI screening, cap pay ranges at $50,000, ban "Canadian experience" requirements, and tell interviewed applicants the hiring decision within **45 days**. [A] <https://www.ontario.ca/document/your-guide-employment-standards-act-0/requirements-related-publicly-advertised-job>
  - **New York** passed a ghost-job bill that was awaiting the governor's signature as of 2026-07-23. Employers with 100+ employees must say whether the role will be filled within 90 days and must remove filled ads within two weeks, with a $2,500 fine per violation. [B] <https://www.shrm.org/topics-tools/news/talent-acquisition/new-york-law-ghost-job-postings>
  - A federal ban proposal drew **446 points and 253 comments** on HN in August 2025. [C] <https://news.ycombinator.com/item?id=45028785>

### Representative quotes

> "I applied for a role in December '25, got a (boilerplate) rejection email a couple of days later … job ad goes offline and re-appeared 3 months later - exact same time and job description." HN, 2026-06-16 [C] <https://news.ycombinator.com/item?id=48561468>

> "Lots of companies putting out the exact same job listings, month after month, and I refuse to believe that they haven't found the right candidate after 6 months of continuous interviews." HN, "UK IT job searching broken", 2025-03 [C] <https://news.ycombinator.com/item?id=43433678>

> "Only 17%?? Last time I was job hunting I found that 80%+ of postings were either dupes or bogus." HN, 2025-08 [C] <https://news.ycombinator.com/item?id=45029568>

> "rejections came within hours / the same jobs kept resurfacing / 'urgent' roles already had hundreds of applicants / some listings never seemed to go away" HN, 2026-01-12 [C] <https://news.ycombinator.com/item?id=46593276>

> "How do you know if a job listing is a fake listing as part of a Labor Market Test? … I've seen some that list a very precise salary (not a range)". r/ExperiencedDevs, 2026-04-15. This is a distinct US subtype: PERM/green-card postings that are legally required but not meant to be won. [C] <https://www.reddit.com/r/ExperiencedDevs/comments/1sm7yzd/how_do_you_know_if_a_job_listing_is_a_fake/>

### What current tools fail to do

- Job boards show a "posted X days ago" date, but a repost resets it. That is exactly the pattern the quotes above describe. Nothing tracks a posting's history *across reposts* or tells the user it has been open for 6+ months.
- Seekers are building their own detectors, which shows unmet demand: "Show HN: Got laid off. Got sick of ghost jobs. Built something" (2025-05) [C] <https://news.ycombinator.com/item?id=43853401>, and several r/cscareerquestions posts in 2026 advertising ghost-job analyzers (most removed by moderators) [C] <https://www.reddit.com/r/cscareerquestions/comments/1t5wlwa/i_built_a_free_tool_that_analyzes_job_postings/>.
- The coming legal disclosures (Ontario "existing vacancy" flag, NY "fill within 90 days") create structured signals, but no aggregator surfaces them yet. **(inferred:** I found no aggregator doing this.**)**

**Severity / opportunity: 5 / 5.** The problem is common, measured by the platforms themselves, emotionally charged, and partly detectable from public data (repost history, time open, whether the posting also appears on the careers page, ATS requisition IDs).

---

## 2. AI slop on both sides: application floods, auto-apply bots, AI screening

### How widespread

- LinkedIn reportedly processes about **11,000 applications per minute**, up 45% year over year, with generative AI tools cited as the driver. [B] <https://www.eweek.com/news/ai-job-applications-linkedin/>
- **22%** of US job seekers use AI agents to submit applications on their behalf. **24%** use AI during technical interviews, and **18%** use it to answer take-home assignments (Greenhouse *2025 Workforce & Hiring Report*, 6,000 workers in the US, UK and Ireland). [A] <https://cdn.prod.website-files.com/66bf84e70c6fc57dbbe0187e/687530e016ce4153b861335b_Greenhouse_2025WorkforceAndHiringReport.pdf>
- **49%** of US job seekers submitted more applications than a year earlier, and **41%** admit hiding prompt injections in their résumés. Among hiring managers, 65% have caught AI-assisted fraud and 22% have found hidden prompt injections (Greenhouse, November 2025). [A] <https://www.greenhouse.com/newsroom/an-ai-trust-crisis-70-of-hiring-managers-trust-ai-to-make-faster-and-better-hiring-decisions-only-8-of-job-seekers-call-it-fair>
- **38%** of candidates admit to mass-applying (Greenhouse, December 2024). [A] <https://www.greenhouse.com/blog/greenhouse-2024-state-of-job-hunting-report>
- On the employer side, **67%** of US HR leaders say AI-generated applications slowed hiring, and 20% report delays of more than two weeks. 84% of HR teams feel overworked by the added review time, and 38% are *adding* interviews per candidate. Robert Half surveyed 2,000+ US hiring managers in November 2025 and published on 2026-03-10. [A] <https://press.roberthalf.com/2026-03-10-Robert-Half-survey-67-of-HR-leaders-report-AI-generated-applications-are-slowing-hiring>
- Only **8%** of job seekers think AI screening makes hiring fairer, and 87% want employers to disclose their AI use (Greenhouse, November 2025). [A] <https://www.greenhouse.com/newsroom/an-ai-trust-crisis-70-of-hiring-managers-trust-ai-to-make-faster-and-better-hiring-decisions-only-8-of-job-seekers-call-it-fair>
- AI interviews: **63%** of job seekers have faced one (up 13 points in six months). **70%** were not clearly told up front that AI would evaluate them, and **38%** abandoned a process because of an AI interview. After an AI interview, **51% never heard back** (Greenhouse, 2,950 job seekers, 2026-05-01). [A] <https://www.greenhouse.com/newsroom/63-of-job-seekers-have-faced-an-ai-interview-most-havent-had-a-good-one-yet>
- Legal exposure is real. In *Mobley v. Workday*, a federal court on 2025-05-16 preliminarily certified a nationwide age-discrimination collective of applicants aged 40+ screened by Workday's AI since 2020-09-24. The plaintiff says he applied to 100+ jobs and "was rejected every time". [B] <https://www.hklaw.com/en/insights/publications/2025/05/federal-court-allows-collective-action-lawsuit-over-alleged>

### Representative quotes

> "We had 1200 applications for an extremely niche role. A huge amount were clearly faked resumes that far too closely matched the job description to be realistic. Another huge portion were just unqualified." A hiring manager on HN, 2025-09 [C] <https://news.ycombinator.com/item?id=45269391>

> "I got rejected within 30 minutes of applying so I guess I'm in the clear?" HN, 2025-10 [C] <https://news.ycombinator.com/item?id=45451932>

> "Recruiters have been repeatedly spamming me, only to ghost me when I ask if they can match my current pay … They must be using some kind of AI tool to repeatedly follow up to candidates." r/cscareerquestions, 2026-03-20 [C] <https://www.reddit.com/r/cscareerquestions/comments/1rz156f/recruiters_have_been_repeatedly_spamming_me_only/>

> Auto-apply outcome: one LazyApply user reportedly sent 5,000 applications and got 20 interviews (0.4%). [C][secondary blog, original source not traced] <https://blog.theinterviewguys.com/the-20-interviews-from-5-000-applications-math-auto-apply-doesn-t/>

### What current tools fail to do

- Auto-apply tools (LazyApply, AIApply, LoopCV, JobCopilot) add volume on one side of an arms race. Employers answer with more screening, more rounds and bot/velocity filters, so each application is worth less (Robert Half data above).
- Nothing lets a qualified human *prove* they are real and relevant in a way that beats the flood, such as a verified identity plus verified skills plus a match rationale the employer can trust.
- AI screening is invisible to the candidate. Seekers cannot tell whether a human ever saw them, and 70% are not told about AI interviews up front (Greenhouse, May 2026).

**Severity / opportunity: 5 / 4.** Severity is maximal. The opportunity is slightly lower because a pure job-seeker app cannot fix employer-side screening alone. It can, however, refuse to be another spam cannon and route users to lower-volume, higher-signal channels.

---

## 3. Time spent per application: repeated ATS forms, re-typing the CV, Workday accounts

### How widespread

- Direct 2025–2026 measurements of minutes per application for tech roles were **not found**. The best available data is old:
  - 60% of job seekers quit online applications midway because of length or complexity (CareerBuilder, reported by SHRM on 2016-03-08). [B][old] <https://www.shrm.org/topics-tools/news/technology/study-job-seekers-abandon-online-job-applications>
  - Appcast found completion rates fall by about half with 50+ questions versus 25 or fewer, and that cutting applications to 5 minutes or less can lift conversion by up to 365%. [B][old] Same SHRM link.
- **31%** of US adults would not apply for a job that requires a cover letter (ASA/Harris Poll, 2,077 adults, 2024-08-13 to 15). [A][old] <https://americanstaffing.net/posts/2024/11/20/hopeless-hunting/>
- The structural cause is well documented. Workday and similar ATSs run one tenant per employer, so candidates create a new account for each company and re-enter data the résumé parser missed.

### Representative quotes

> "I often just pass up companies that only have their application on Workday. Workday is without question the most abominable of the online application systems available today." HN, 2026-01-26 [C] <https://news.ycombinator.com/item?id=46773543>

> "u have to customize CV, cover letter which itself has become full time job" HN, 2026-07-01 [C] <https://news.ycombinator.com/item?id=48753323>

> "application pages are well past just a resume and cover letter. Now they want me to fill out fields like 'How many years of experience in React do you have'". The poster asks whether to lie in these dropdowns, since they work as hard knockout filters. r/cscareerquestions, 2025-06-22 (70 upvotes, 64 comments) [C] <https://www.reddit.com/r/cscareerquestions/comments/1lhs4g7/should_you_lie_in_job_application_dropdowns/>

> "Why do I need to create an account to apply for a role? Why do I need to retype the info when I already uploaded my resume?" Replies included "Their fucking parser seems to use tech from 1995" and "It doesn't accept chrome autofill". Blind, 2023-08-20 [C][old] <https://www.teamblind.com/post/rant-workday-is-the-most-stupid-recruitment-platform-out-there-seakpkne>

### What current tools fail to do

- Browser autofill extensions (e.g., Simplify Copilot, which says it "makes it easier to apply to those multi-step application forms (workday, taleo, sap, etc.)") [C] <https://news.ycombinator.com/item?id=43777893> reduce typing. They do not remove account creation, custom screening questions, or per-role CV tailoring.
- Auto-apply bots remove the typing by removing the judgment. Section 2 shows why that backfires.
- No standard portable candidate profile is accepted across ATS tenants. **(inferred)**

**Severity / opportunity: 4 / 3.** The pain is real and universal, but the fix is crowded (autofill extensions are commoditized) and partly outside a job-seeker app's control. The value is in combining it with "apply only to jobs worth it" (sections 1 and 4), so fewer forms get filled.

---

## 4. Bad matching: irrelevant recommendations, seniority mismatch, keyword filters

### How widespread

- The *supply* of matches is skewed. Senior requirements are rising and junior postings are shrinking faster (Indeed Hiring Lab, section 0). [A] <https://hiringlab.indeed.com/2025/07/30/experience-requirements-have-tightened-amid-the-tech-hiring-freeze/>
- **72%** of applicants say the job they applied for differed from the role finally offered (Greenhouse, December 2024, as reported by UNLEASH). [B] <https://www.unleash.ai/artificial-intelligence/news/greenhouse-61-of-job-seekers-have-been-ghosted-during-the-recruitment-process>
- I found no representative 2025–2026 survey that specifically measures recommendation relevance for developers. **The evidence here is anecdotal.**

### Representative quotes

> "Why do jobs I hide keep coming back? Why when I say I don't want to see a company anymore do I keep seeing said company?" Reply: "Their whole personalization/rec engine is crap. Also, search bar is useless, notifications are just noise…" Blind, 2023-02 [C][old] <https://www.teamblind.com/post/linkedinmates-your-job-recommendation-engine-is-crap-h8prz6ij>

> "I was applying broadly on LinkedIn … So I started being stricter about what I applied to and filtered out: promoted jobs, roles I'd already applied to, jobs I'd already viewed, postings that looked heavily overcrowded … it significantly reduced time spent and burnout." HN, 2026-01-12 [C] <https://news.ycombinator.com/item?id=46593276>

> "In 2019, as a junior developer, I had 8 interviews within two months and got hired on 9nth. Now, as a senior developer with six years of experience, I can barely get a single interview per month … I mostly receive automated rejections or dead silence … And some of them even reopen the same postings after several weeks!" r/ExperiencedDevs, "Something is way off with the current job market", 2026-05-09 (521 upvotes, 328 comments) [C] <https://www.reddit.com/r/ExperiencedDevs/comments/1t839op/something_is_way_off_with_the_current_job_market/>

> "Im a senior/staff level front end engineer with experience at some large companies. I cant get an interview to save my life … All the jobs I apply for I am very much qualified for." r/cscareerquestions, 2025-10-10 (266 upvotes) [C] <https://www.reddit.com/r/cscareerquestions/comments/1o3akpu/what_is_going_on_out_there/>

> "I am a software engineering team director … Over my 31-year career, I worked for 3 organizations … I fear that my dedication and loyalty will now cost me." r/ExperiencedDevs, 2026-05-24 [C] <https://www.reddit.com/r/ExperiencedDevs/comments/1tmq101/i_am_a_software_engineering_team_director_with_a/>

### What current tools fail to do

- Recommendation feeds optimize for engagement and promoted listings, not fit. The HN user above had to hand-filter out *promoted* jobs. Hidden jobs and blocked companies reappear (Blind).
- Filters are coarse. They cannot express "senior backend, Go or Rust, no crypto, hires from Moldova or through an EOR, overlaps 4 hours with CET". **(inferred** from the gap between these complaints and the filter options on major boards**)**
- ATS keyword filters reject on vocabulary rather than competence **(inferred)**. The 41% prompt-injection rate in section 2 is consistent with seekers trying to game those filters, though Greenhouse does not give that as the reason.

**Severity / opportunity: 4 / 5.** This is where a developer-specific product can differentiate most cheaply. Structured tech stacks, seniority parsing, eligibility constraints and explainable match reasons are tractable with today's LLMs, and incumbents have little incentive to fix them.

---

## 5. The "black hole": no feedback, silent rejections, ghosting after interviews

### How widespread

- **61%** of job seekers were ghosted *after an interview*, up 9 points since April 2024. The rate is 66% for historically underrepresented candidates (Greenhouse, December 2024). [A] <https://www.greenhouse.com/blog/greenhouse-2024-state-of-job-hunting-report>
- **72%** of Americans say applying feels like "sending résumés into a black box", and **40%** of unemployed job seekers had not had a single interview in 12 months (ASA/Harris Poll, August 2024). [A][old] <https://americanstaffing.net/posts/2024/11/20/hopeless-hunting/>
- Ghosting is job seekers' top challenge for the third straight year, cited by **59.0%** (iHire/Harris Poll, 2025). [B][unverified: page returned 403] <https://www.ihire.com/resourcecenter/employer/pages/the-state-of-online-recruiting-2025>
- **51%** got no feedback after an AI interview (Greenhouse, May 2026). [A] <https://www.greenhouse.com/newsroom/63-of-job-seekers-have-faced-an-ai-interview-most-havent-had-a-good-one-yet>
- Candidates' top ask is better recruiter communication (42%). [A] <https://www.greenhouse.com/blog/greenhouse-2024-state-of-job-hunting-report>
- Ontario now legally requires a decision within 45 days of an interview, which shows the problem is serious enough to legislate. [A] <https://www.ontario.ca/document/your-guide-employment-standards-act-0/requirements-related-publicly-advertised-job>

### Representative quotes

> "I applied to hundreds of jobs. By now it's maybe even over a thousand. Most of the time it's either no response or 'we decided to move further with a candidate which is more aligned...'. And later I see the same job posting emerge again … some just ghosted me after the code challenge." HN, 2025-09-08 [C] <https://news.ycombinator.com/item?id=45173102>

> "maybe the third 'we'll be in touch' with zero reply, maybe the recruiter who ghosted me after a final interview … I now keep a personal record of every recruiter who contacts me … whether they ghosted, lied, or just wasted my time." HN, 2025-04-23 [C] <https://news.ycombinator.com/item?id=43773047>

> "I've applied to over 1k jobs, I've had roughly 50 interviews, 1 job offer (super underpaid, I rejected) … I apply to these jobs, put it in my excel spreadsheet to keep track and wait … a auto rejection comes in a week or a month later." r/cscareerquestions, IT/security candidate with 3 years' experience, 2025-06-17 (222 upvotes) [C] <https://www.reddit.com/r/cscareerquestions/comments/1ldwr42/cant_land_a_it_software_cyber_job_at_all/>

> "A recruiter messages me on LinkedIn: 'Hey, I came across your profile, you'd be a great fit…' I provide my availability … And then… nothing." r/cscareerquestions, "Recruiters who ghost after they reach out first, why?", 2025-10-28 [C] <https://www.reddit.com/r/cscareerquestions/comments/1ohzqxr/recruiters_who_ghost_after_they_reach_out_first/>

> "if a company can reschedule onsite 4 times, the company can manage to at least not ghost us?" r/cscareerquestions, 2026-06-12 (post title; body removed) [C] <https://www.reddit.com/r/cscareerquestions/comments/1u3pyn2/if_a_company_can_reschedule_onsite_4_times_the/>

### What current tools fail to do

- Trackers (spreadsheets, Huntr/Teal-style boards) record what the *user* did. They cannot tell the user whether a silence means rejection.
- Crowd-sourced ghosting data exists but is small and fragmented, e.g., "Show HN: I built didtheyghost.me" (2025-03) [C] <https://news.ycombinator.com/item?id=43300204>.
- No product gives a calibrated estimate like "this company typically responds within N days, and after 21 days of silence your odds are under X%". Nor does any close the loop automatically (inbox parsing, a nudge at the right moment, marking dead applications). **(inferred)**

**Severity / opportunity: 5 / 4.** This is the most-cited complaint across every survey. A seeker-side product can add *expected response time and closure* from aggregated user data and email parsing, but it cannot force employers to reply.

---

## 6. Hidden salaries and pay transparency

### How widespread

- In the US, **59%** of Indeed postings included pay information as of May 2025, and growth had slowed. [B] <https://www.indeed.com/news/releases/pay-transparency-across-high-earning-sectors> and <https://www.hrdive.com/news/salary-transparency-is-trending-up-but-at-a-slower-pace/731502/>
- In Europe (March 2026), the share of postings with salary information was UK 56%, Netherlands 48%, France 43%, Ireland 39%, Italy 36%, Spain 17% and **Germany 12%**. The trend has been flat for two years. The EU Pay Transparency Directive deadline is June 2026, and most large member states will miss it: Germany had no bill and the Netherlands pushed to 2027. [A] <https://hiringlab.indeed.com/uk/blog/2026/05/07/full-salary-transparency-in-europe-is-still-a-distant-prospect/>
- **44%** of US adults who applied in the past year are unlikely to apply to a posting without a salary range (Patriot Software, 1,000 respondents). [B][unverified: page returned 403] <https://www.patriotsoftware.com/blog/payroll/pay-transparency-hiring-survey/>
- A rough count of my own: in HN "Who is hiring? (August 2026)", **53 of 234** top-level posts (23%) contain a $/€/£ salary figure. This is a crude regex count that misses formats like "150k", so treat it as a floor. [C, my own count] <https://news.ycombinator.com/item?id=49156683>

### Representative quotes

> "Recruiters have been repeatedly spamming me, only to ghost me when I ask if they can match my current pay". r/cscareerquestions, 2026-03-20 [C] <https://www.reddit.com/r/cscareerquestions/comments/1rz156f/recruiters_have_been_repeatedly_spamming_me_only/>

> "Recruiter pushed me for my salary range, told me the position pays less than my desired salary … I told her it's early in the process, but that I saw the range on the posting and I would be comfortable wi[th]…". A tech worker at a big-tech recruiter screen, r/recruitinghell, 2026-09-13 [C] <https://www.reddit.com/r/recruitinghell/comments/1wewddj/recruiter_pushed_me_for_my_salary_range_told_me/>

> "I was flat out rejected for a role for listing a desired salary $3-5k over their budget and true negotiations never took place." r/recruitinghell, 2026-09-09 (108 upvotes, 101 comments; not tech-specific) [C] <https://www.reddit.com/r/recruitinghell/comments/1wbnwop/rejected_for_desired_salary_did_i_handle_this/>

> "they would save time, and potential applicants would save time, if they include the salary in the job posting." r/recruitinghell, 2026-08-28 (not tech-specific) [C] <https://www.reddit.com/r/recruitinghell/comments/1w14qxz/companies_need_to_include_a_salary_range_in_job/>

> "'That's a great question and I noticed you didn't mention a salary range on the posting'. Allow for an uncomfortable silence as now they're either forced to give a range, or try to say something like, 'it's flexible for the right candidate'." HN, 2026-02-16 [C] <https://news.ycombinator.com/item?id=47039938>

> "That tells you what the base salary range is, and the range can be quite large." HN, 2026-02-24, on why posted ranges still don't answer the question [C] <https://news.ycombinator.com/item?id=47139126>

> "here is a senior role at 59 000 euro per year". HN, 2026-06-13, on a posting that disclosed pay but at a "considerable discount to market" [C] <https://news.ycombinator.com/item?id=48515576>

### What current tools fail to do

- Boards show a range only when the employer supplies one, and they rarely flag absurdly wide ranges. Ontario had to legislate a $50,000 cap. [A] <https://www.ontario.ca/document/your-guide-employment-standards-act-0/requirements-related-publicly-advertised-job>
- Salary databases (Levels.fyi, Glassdoor) are strong for US Big Tech and weak for EU mid-size companies and remote-from-anywhere contracts. Nothing normalizes a posting to "what this means net, for a contractor in Chișinău versus an employee in Berlin". **(inferred)**
- Pay is usually discovered only after one or more screening rounds (see quotes), which wastes the time sections 3 and 8 measure.

**Severity / opportunity: 4 / 4.** For an EU/remote-first audience the gap is larger than in the US, because disclosure rates in Germany and Spain are very low. Estimating pay for undisclosed postings, and normalizing it across countries and contract types, is defensible data work.

---

## 7. Scams and fake recruiters targeting developers

### How widespread

- **General job scams (FTC, US).** Task-scam reports went from 0 in 2020 to 5,000 in 2023 to about 20,000 in H1 2024 alone, nearly 40% of 2024 job-scam reports. Job-scam losses exceeded $220M in H1 2024 (FTC press release, 2024-12-12). [A][old] <https://www.ftc.gov/news-events/news/press-releases/2024/12/new-ftc-data-show-skyrocketing-consumer-reports-about-game-online-job-scams>
- Reported job-scam losses rose from $90M (2020) to $501M (2024). [B] <https://www.moodys.com/web/en/us/kyc/resources/insights/uncovering-hidden-fraud-trends-the-rise-of-job-scams-and-data-exploitation.html>
- I could not open FTC's full 2025 figures (the page returned 503).
- **Developer-specific: "Contagious Interview".** Attackers pose as recruiters from crypto or AI firms and ask candidates to clone and run a "coding assessment" repo (npm package, or a VS Code task config). That deploys backdoors (OtterCookie, InvisibleFerret, FlexibleFerret) that steal credentials, tokens and wallets. The campaign has run since at least December 2022, with new variants still detected in 2026 (Microsoft Security, 2026-03-11). [A] <https://www.microsoft.com/en-us/security/blog/2026/03/11/contagious-interview-malware-delivered-through-fake-developer-job-interviews/>
- GitLab reportedly banned 131 accounts tied to these North Korean campaigns in 2025. [B] <https://cybersecuritynews.com/north-korean-threat-actors-leverage-fake-it-worker-campaigns/>
- The reverse direction exists too: 91% of recruiters have spotted candidate deception, and 18% have seen deepfake appearances (Greenhouse, November 2025). That pushes employers toward identity verification, which will reach honest candidates. [A] <https://www.greenhouse.com/newsroom/an-ai-trust-crisis-70-of-hiring-managers-trust-ai-to-make-faster-and-better-hiring-decisions-only-8-of-job-seekers-call-it-fair>

### Representative quotes

> "Everything seemed normal; the messages were professional, the challenge looked legit, and they shared a Bitbucket link to a Node.js project for a take-home assignment … Almost instantly, I noticed abnormal activity: Multiple Node processes started in the background." dev.to, a developer approached on LinkedIn for a "Web3 Full Stack Developer" role, 2025-11-10 [C] <https://dev.to/longblade/i-was-given-a-job-assignment-that-installed-malware-26e2>

> "I always run (p)npm audit before running npm repos, so lots of issues were found … So I asked the recruiter about it and if it makes sense to run it in an isolated VM. No answer... The other was for a DevEx crypto service … the recruiter was strange and changed their profi[le]". HN, 2026-06-16 [C] <https://news.ycombinator.com/item?id=48551429>

> HN story titles: "Fake job recruiters hide malware in developer coding challenges" (2026-02) <https://news.ycombinator.com/item?id=47030847>; "We posted a job. Then came the AI slop, impersonator and recruiter scam" (2026-01) <https://news.ycombinator.com/item?id=46749903> [C]

### What current tools fail to do

- LinkedIn InMail and "recruiter" profiles carry no reliable proof that the sender works for the company named.
- Job boards moderate *postings*, but these scams arrive by DM, with repos hosted on GitHub, GitLab or Bitbucket, entirely outside the board.
- Standalone "scam checkers" exist, but they are one-off paste-a-post tools, e.g., "Show HN: LinkedIn Job Scam Detector" (2025-10) <https://news.ycombinator.com/item?id=45605109> and "Show HN: Real Job Check" (2026-06) <https://news.ycombinator.com/item?id=48493550> [C]. Nothing ties recruiter identity, company domain verification and "never run this repo outside a sandbox" warnings into the application flow.

**Severity / opportunity: 4 / 3.** The harm per incident is severe (credential and wallet theft, compromised employer access), and the target is exactly Pemby's audience. As a standalone product it is hard to monetize. It works best as a trust feature: verified recruiters and companies, and flags on repos or links a take-home asks you to run.

---

## 8. Interview-process fatigue: take-homes and many rounds

### How widespread

- Employers are adding friction in response to AI:
  - 38% of HR leaders are increasing interviews per candidate [A] <https://press.roberthalf.com/2026-03-10-Robert-Half-survey-67-of-HR-leaders-report-AI-generated-applications-are-slowing-hiring>
  - 39% of US hiring managers are doing more in-person interviews [A] <https://www.greenhouse.com/newsroom/an-ai-trust-crisis-70-of-hiring-managers-trust-ai-to-make-faster-and-better-hiring-decisions-only-8-of-job-seekers-call-it-fair>
- Candidates use AI inside the process: 24% during technical interviews, 18% for take-homes, 17% during live interviews (Greenhouse *2025 Workforce & Hiring Report*). [A] <https://cdn.prod.website-files.com/66bf84e70c6fc57dbbe0187e/687530e016ce4153b861335b_Greenhouse_2025WorkforceAndHiringReport.pdf> This erodes the value of take-homes and pushes companies toward more live rounds.
- **No rigorous 2025–2026 dataset on the number of rounds was found.** Claims of "4–6 rounds" come from interview-prep vendors. [C] <https://prepfully.com/interview-guides/software-engineer-interview-guide>
- Engagement is high. "I failed a take-home assignment from Kagi Search" drew 289 points and 363 comments (2025-05). [C] <https://news.ycombinator.com/item?id=43980036>

### Representative quotes

> "Every job interview process I've been part of has 5-8 rounds, with each round ranging between half an hour to 2 hours. On average, every job interview process I get (well what few I get), takes on average 5 hours before I get rejected." r/ExperiencedDevs, "Senior SWE running out of PTO to do interview[s]", 2026-08-12 (220 upvotes, 233 comments; later removed by moderator) [C] <https://www.reddit.com/r/ExperiencedDevs/comments/1vm99jh/senior_swe_running_out_of_pto_to_do_interview/>

> "some where four, six, seven plus rounds in total. Like what?? I personally have a young family … barely any time to search for jobs, do interviews, and then restudy/relearn all my Data Structures and Algorithms". r/ExperiencedDevs, 2026-06-09 (308 upvotes; removed by moderator) [C] <https://www.reddit.com/r/ExperiencedDevs/comments/1u12mk5/any_other_experienced_developers_just_not_have/>

> "3 years ago (even in the midst of several high profile layoffs) I applied to 3 jobs, got 2 offers and I barely prepped for interviews. This time, I spent weeks on hellointerview and neetcode/leetc[ode]". An 11-year developer, r/ExperiencedDevs, 2026-05-20 [C] <https://www.reddit.com/r/ExperiencedDevs/comments/1tisfvj/whats_actually_happening_in_recruiting_process/>

> "For the last nine months, it's been calls with recruiters, rejection after rejection, 5 rounds of interviews that leads to a rejection … lately? They're giving me SDE level challenges." r/devops, 2026-02-13 [C] <https://www.reddit.com/r/devops/comments/1r3tfjt/whats_up_with_these_sde_style_interviews/>

> "I don't want to put my future coworker through six rounds of interviews. If it takes more than three rounds + a phone screen to figure out if someone is a good fit then the process is broken." HN, 2026-06-05 [C] <https://news.ycombinator.com/item?id=48414108>

> "At one place I got rejected at the final round, they had two screening rounds: code assignments. They told me, that both of these challenges were cleared only by 15% of total applicants." HN, 2025-09-08 [C] <https://news.ycombinator.com/item?id=45173102>

> "I would never ask 20 people to do a take-home assignment. There are so many better ways to test team fit before asking someone to commit serious, unpaid, time to a project." HN, 2025-05-14 [C] <https://news.ycombinator.com/item?id=43980696>

### What current tools fail to do

- Candidates cannot see a company's *actual* process length, take-home size or pass rate before applying. Glassdoor-style interview reviews are sparse and stale for smaller companies. **(inferred)**
- Nobody lets you reuse proof of skill across companies (one verified assessment accepted by many), so candidates repeat the same screens.

**Severity / opportunity: 3 / 3.** The pain is real and recurs in high-engagement posts (5–8 rounds, PTO exhaustion), but no representative survey counts rounds, and the fix sits with employers. A seeker product can help cheaply by publishing crowd-sourced process length and take-home size per company.

---

## 9. Location and timezone restrictions on "remote" roles (brief; covered in depth by another worker)

- In HN "Who is hiring? (August 2026)", **111 of 234** top-level posts mention "remote" in the header line. **At least 44** of those restrict remote to the US or North America. This is my own regex count on header lines only, a floor rather than an exact figure. [C, my own count] <https://news.ycombinator.com/item?id=49156683>
- Stack Overflow 2025: **32.4%** of developers worldwide work fully remote. The US has the highest remote share among top countries (45%). [A] <https://survey.stackoverflow.co/2025/work>
- Voices from outside the US:
  - "Long-term strategy to reach US job market as an EU developer?" (Latvia), r/ExperiencedDevs, 2026-04-30 [C] <https://www.reddit.com/r/ExperiencedDevs/comments/1t09875/longterm_strategy_to_reach_us_job_market_as_an_eu/>
  - "I'm based in Mexico and have 20+ years of experience … LinkedIn and Indeed feel like a dead end." r/remotework, 2026-07-27 [C] <https://www.reddit.com/r/remotework/comments/1v8d7vz/looking_for_a_place_to_start_because_linkedin_and/>
- "There are now multiple filtering layers before a human even sees a resume — ATS filters, huge application volume, location/visa filtering, internal candidates, etc." A comment on r/ExperiencedDevs, 2026-05 [C] <https://www.reddit.com/r/ExperiencedDevs/comments/1t839op/something_is_way_off_with_the_current_job_market/om30hsl/>
- The Ontario ban on "Canadian experience" requirements shows that location-based exclusion is recognized as a discrimination issue in at least one jurisdiction. [A] <https://www.ontario.ca/document/your-guide-employment-standards-act-0/requirements-related-publicly-advertised-job>

**Severity / opportunity: 5 / 5 for the founder's segment (Moldovan citizenship only).** The rating is provisional, pending the dedicated report. "Remote" without an eligible-countries field is a direct instance of the section 4 filter failure.

---

## 10. Other recurring themes

- **Discriminatory questions.** 64% of US candidates report discriminatory or biased interview questions, most often about age, race or gender (Greenhouse, December 2024). [A] <https://www.greenhouse.com/blog/greenhouse-2024-state-of-job-hunting-report>
- **Age.** AI interviews: 36% perceive age bias (Greenhouse, May 2026). [A] <https://www.greenhouse.com/newsroom/63-of-job-seekers-have-faced-an-ai-interview-most-havent-had-a-good-one-yet> Among Boomers, discrimination is the leading job-search challenge (44%). [A] <https://cdn.prod.website-files.com/66bf84e70c6fc57dbbe0187e/687530e016ce4153b861335b_Greenhouse_2025WorkforceAndHiringReport.pdf> See also *Mobley v. Workday* in section 2.
- **Mental toll and long searches.** 26% of job seekers across the US, UK and Ireland have been searching 6+ months, and 6% for more than 2 years (Greenhouse *2025 Workforce & Hiring Report*). [A] Same PDF. Top HN threads: "When the job search becomes impossible" (283 points, 448 comments, 2025-09) <https://news.ycombinator.com/item?id=45261848>; "Is anyone else just done with the industry?" (147 points, 2025-06) <https://news.ycombinator.com/item?id=44393304> [C]
- **Referrals beat applications, and seekers know it.** "In my 6 jobs … I have never gotten a job from sending an application into a site. It's always been through (somehow) tracking down a person" [C] <https://news.ycombinator.com/item?id=45262739>. Another user: "passive options were far more effective than active searches - the process is definitely upside down" [C] <https://news.ycombinator.com/item?id=47480062>. This suggests the cold-apply funnel itself is the weak channel.

---

## Summary table

| # | Theme | Best prevalence number (date) | Evidence strength | Severity | Opportunity |
|---|---|---|---|---|---|
| 1 | Ghost / stale jobs | 18–22% of Greenhouse postings; 69% of US seekers saw fakes (Nov 2025) | Strong | 5 | 5 |
| 2 | AI slop, volume, AI screening | 67% of HR leaders say AI apps slow hiring (Nov 2025); 63% faced AI interviews (May 2026) | Strong | 5 | 4 |
| 3 | Time per application / ATS forms | 60% abandon long forms (2016) | Weak / old | 4 | 3 |
| 4 | Bad matching / seniority | 5+ yr requirements 37%→42% (2022→2025) | Medium (supply data strong, relevance data anecdotal) | 4 | 5 |
| 5 | Black hole / ghosting | 61% ghosted after interview (Dec 2024); 51% no reply after AI interview (May 2026) | Strong | 5 | 4 |
| 6 | Hidden salaries | US 59% disclose (May 2025); Germany 12% (Mar 2026) | Strong | 4 | 4 |
| 7 | Scams / malware recruiters | Task scams ~20k reports H1 2024; ongoing DPRK dev-targeting (Mar 2026) | Strong for existence, weak for dev-specific rate | 4 | 3 |
| 8 | Interview fatigue | 38% of employers adding interviews (Nov 2025) | Medium / anecdotal on candidate side | 3 | 3 |
| 9 | Location/timezone gating | ≥44 of 111 remote HN posts US/NA-only (Aug 2026, own count) | Medium | 5 (founder segment) | 5 |

---

## Top 7 unsolved problems (ranked for a new product)

Ranking weighs prevalence, evidence strength, how badly incumbents fail, and whether a seeker-side product can actually move the needle.

1. **"Is this job real, open, and still worth my time?"** Ghost, stale, reposted and labor-market-test postings make up about 1 in 5 postings by Greenhouse's own count, and nothing tracks posting history across reposts or surfaces the new legal vacancy disclosures (Ontario, New York). This is the single clearest wedge.
2. **"Can I actually be hired for this?"** Eligibility (country, work authorization, timezone overlap, contractor vs employee, EOR) and true seniority fit are buried in free text. "Remote" often means US-only. This compounds every other problem for non-US/EU candidates, which is the founder's exact segment. *(Provisional, pending the dedicated location report.)*
3. **The black hole: no status, no closure.** It is the top complaint in every survey (59–72%), and no tool estimates response likelihood or auto-closes dead applications. A seeker app can add per-company response-time data and inbox-driven status without employer cooperation.
4. **Signal collapse from the AI arms race.** Volume is up, screening is harsher and more opaque, and honest candidates are lost in bot traffic. The unsolved need is a credible "real, relevant human" signal plus routing toward low-volume, high-response channels (fresh postings, direct hiring-manager posts, referrals) instead of another auto-apply cannon.
5. **Pay opacity, especially outside the US.** Disclosure is 12–43% in major EU markets and flat for two years. Nothing estimates pay for undisclosed postings or normalizes it across countries and contract types. Candidates find out after spending rounds on it.
6. **Repeated application labor.** Workday-style per-tenant accounts and re-typing survive despite autofill extensions. This is best solved *indirectly*: fewer, better-targeted applications, plus a portable profile and autofill for the ones that matter.
7. **Recruiter and take-home trust for developers.** Malware-laden "coding assessments" from fake recruiters are a live, developer-specific threat with a documented 2022–2026 history. A verified-recruiter and verified-company layer, plus warnings on repos a take-home asks you to run, fits naturally into a developer job app as a trust feature rather than a product on its own.

Just outside the top 7: **interview-process transparency** (number of rounds, take-home size and pass rates per company). The pain is real but the evidence is anecdotal.

---

## Gaps and what I did not verify

- **Reddit.** Direct Reddit fetches were blocked. Posts came from the Arctic Shift archive, which timed out on several queries. There are quotes from r/cscareerquestions, r/ExperiencedDevs, r/recruitinghell, r/devops and r/remotework. r/webdev, r/sysadmin and r/digitalnomad have **no quotes**. Searches for Workday, ghost-job, take-home and fake-recruiter posts on Reddit failed, so those sections lean on HN, Blind and dev.to. Post scores are as archived and may differ from live Reddit. Several high-scoring posts were later removed by moderators.
- **Blind.** Only two posts were read, both from 2023.
- **Not opened at source (403/503):** iHire *State of Online Recruiting 2025*, Patriot Software pay survey, CNBC ghost-job law article, Clarify Capital ghost-job pages, FTC 2025 fraud totals. Figures from these are marked [unverified] or omitted.
- **LinkedIn Economic Graph** applicants-per-hire data for software roles was not retrieved (search budget exhausted). The "11,000 applications per minute" figure is secondary [B].
- **No data specific to Eastern Europe, Moldova, or non-EU citizens** was found for any theme.
- The HN "Who is hiring" counts are my own rough regex counts over a single month's thread. Use them as direction, not as precise shares.
