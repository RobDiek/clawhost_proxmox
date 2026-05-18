# SEO Algorithm 2026 — Strategic Reference for ClawFlow Monthly-Plan Generator

> **Purpose:** Ground-truth document read at runtime by the monthly-plan generator (Opus 4.7) to prioritize ranking signals, content strategy, link strategy, AEO/GEO optimization, and paid-organic synergy recommendations for Israeli SMB clients.
>
> **Refresh cadence:** Quarterly. Last full research pass: May 2026.
> **Coverage:** Google + AI Overviews + ChatGPT/Claude/Perplexity citation patterns. Israel market focus (Hebrew + IL geo).
> **Out of scope (covered elsewhere):** Opportunity Score formula, 7-intent taxonomy, AEO target formula, 4 competitor buckets, JTBD persona format — see `project_seo_playbook_sergei.md`. Link budget scenarios — see `project_link_strategy_scenarios.md`.

---

## Section 1: Google Algorithm Evolution 2024–2026

The defining shift of the 2024–2026 cycle is the **absorption of the Helpful Content System into the core ranking algorithm** (March 2024). What used to be a separate periodic update is now a continuous, real-time signal woven through every core update. Google publicly committed to a 45% reduction of "low-quality, unoriginal content" in search results, and the March 2024 core update (which took 45 days to roll out, March 5 → April 19) delivered the biggest reshuffle since Panda. Sites publishing scaled AI content with no editorial layer were the primary casualties — gaming sites, recipe sites, and review aggregators saw 40–90% traffic losses, with some losing 100% of indexed pages.

The subsequent March 2025 and March 2026 core updates reinforced the same principles rather than walking them back. The **March 2026 Spam Update** (paired with the March 2026 core update) explicitly widened SpamBrain's detection of AI-generated spam, manipulative link networks, and "scaled content abuse" patterns: 50–500 AI-generated articles per day across keyword clusters with no human review, identical structure across hundreds of pages, no first-hand experience markers.

E-E-A-T is not a "score" — Google has explicitly said so — but a collection of signals: author entities, topical authority graphs, brand mentions outside backlinks, unlinked mentions on high-authority sites (now detected by LLM-based scrapers), and topical consistency across the site. The **2024 Google Content Warehouse leak** (March 27, 2024) revealed 14,000+ ranking features and confirmed that **NavBoost** is a re-ranking "twiddler" using a rolling 13-month window of click data. The lastLongestClick (final clicked result in a search journey where the user dwelled significantly) is among the strongest user-satisfaction signals. The leak also confirmed `siteFocusScore` and `siteRadius` — page embeddings compared to site embeddings to measure whether a page is on the site's core topic.

### Key facts (2026)

- **Helpful Content System:** absorbed into core in March 2024, continuous signal, not periodic. People-first content is the central rubric.
- **March 2026 Core Update:** confirmed rolling out March 2026 — reinforced topical authority, penalized scaled content abuse, narrowed rich-result eligibility for several schema types.
- **March 2026 Spam Update:** finished in ~19.5 hours, targeted AI spam + manipulative link networks. SpamBrain now neutralizes >99% of link spam automatically.
- **INP** replaced FID as a Core Web Vital on **March 12, 2024**. 2026 thresholds: LCP <2.5s good, INP <200ms good, CLS <0.1 good. INP <200ms = good, 200–500ms = needs improvement, >500ms = poor.
- **43% of sites fail the 200ms INP threshold** — it is the most-failed Core Web Vital in 2026.
- **Core Web Vitals weight:** still a confirmed ranking factor but acts as a **tiebreaker** — small effect, secondary to content quality. Sites with INP >200ms saw ~0.8 position drops on average in 2025–2026 studies.

### Penalty timeline reference

| Penalty/System | Status 2026 |
|---|---|
| Panda | Absorbed into core (2016) — continuous |
| Penguin | Real-time since 2016 — continuous, no manual recovery cycle |
| Link Spam Update (Dec 2022) | Folded into SpamBrain continuous detection |
| Helpful Content System | Absorbed into core March 2024 — continuous |
| March 2024 core | 45 days rollout, scaled-content reset |
| March 2025 core | Reinforced HCS principles |
| March 2026 core + spam | Topical authority + AI-spam crackdown |

**Implication for Monthly Plan Generator:** Treat content quality, first-hand experience markers, and topical authority depth as the dominant levers. INP/CWV recommendations are tiebreakers — flag if INP >200ms, but never lead a plan with technical CWV fixes when content gaps exist. Reference NavBoost: long-dwell, no-pogo-stick UX matters more than density of internal optimization tweaks.

**Sources:**
- [Google Search Central — March 2024 core update + new spam policies](https://developers.google.com/search/blog/2024/03/core-update-spam-policies)
- [Search Engine Land — Google March 2026 core update](https://searchengineland.com/google-march-2026-core-update-rolling-out-now-472759)
- [SearchEngineLand — Google leaked documents 2024](https://searchengineland.com/google-search-document-leak-ranking-442617)
- [web.dev — INP becomes Core Web Vital March 12, 2024](https://web.dev/blog/inp-cwv-march-12)
- [Hobo — Mapping Google updates to leaked ranking signals](https://www.hobo-web.co.uk/evidence-based-mapping-of-google-updates-to-leaked-internal-ranking-signals/)

---

## Section 2: SGE / AI Overviews — The New SERP Layer

AI Overviews (the successor to SGE/Search Generative Experience) now trigger on **~48% of queries** as of late 2025, with informational, comparison, and "best of"/"how to" queries most likely to surface them. Transactional queries (clear commercial intent, branded navigational) still bias toward classic 10-blue-links. Israel-specific rollout: Google announced in May 2025 (I/O) that AI Overviews are available in **200+ countries and 40+ languages**, but Hebrew was not explicitly named in the initial language list. Anecdotal IL-market reports (mid-2026) show AI Overviews appearing intermittently on Hebrew queries — the platform should monitor monthly rather than assume parity with English-language SERPs.

What makes a page eligible to be **cited** inside an AI Overview is meaningfully different from what makes it rank in the traditional 10-blue-links. Multiple 2025–2026 studies converge on seven factors: (1) semantic completeness — the page can fully answer the query without external references (r=0.87 correlation in one study); (2) multi-modal integration — text + image + video together (+156% selection rate); (3) verifiable factual citations on the page itself (+89% probability); (4) vector embedding alignment with the query; (5) E-E-A-T author signals (96% of citations come from pages with explicit author credentials); (6) entity Knowledge Graph density (15+ connected entities → 4.8× citation boost); (7) explicit schema markup (+73% selection rate).

**Schema priority for AI Overview eligibility** is empirically clearer than for traditional SERP. Pages running **Article (or BlogPosting) + FAQPage + HowTo + Organization** are 2.5–2.7× more likely to be cited than pages with no schema. FAQPage is the single highest-impact format — 40–60 word answers get pulled into Overview panels and "People also ask" boxes. **Google's official position remains "no schema required"**, but every empirical study contradicts that on the citation-probability axis.

### AI Overview vs ChatGPT vs Claude vs Perplexity — citation behavior

| Engine | Sources per answer | Top cited domains | Citation trigger | UGC weight |
|---|---|---|---|---|
| **Google AI Overview** | 3–5 with previews | YouTube, Wikipedia, official sites, Reddit | Always for eligible queries | Medium (Reddit ~40%) |
| **ChatGPT** | 2–4 (only when browsing on) | Wikipedia (47.9%), industry-specific official sites | Only when retrieval active | Low–medium |
| **Perplexity** | 4–8 with link visibility | Reddit (46.7%), official sites, directories | Always (live retrieval is core) | High |
| **Claude** | 1–3, fewer, higher authority | User-generated content 2–4× more than peers, reviews | Only when explicitly given source material or web tool | Very high (UGC bias) |
| **Gemini / AI Mode** | Variable | Similar to AI Overview but lower UGC share | Always | Medium |

**Cross-engine constant:** Reddit is the #1 source across every major AI engine, cited at ~40% frequency. YouTube is the most-cited domain in AI search by a 2× margin over the second-place domain across all studied verticals. Wikipedia/Wikidata are foundational anchors (entity disambiguation).

**Zero-click vs branded follow-up:** Brand mentions inside AI Overview answers translate to traffic primarily via branded follow-up search and direct visits, not direct AI Overview clicks. AI Overview CTR is markedly below traditional position 1, but branded search volume lift is measurable when a brand appears repeatedly inside Overviews — this is the "AI Overview halo" mechanism.

**Implication for Monthly Plan Generator:** For any IL client where the target query set includes informational or comparison intents, the plan must include: (1) FAQPage schema with 40–60 word answers; (2) Article schema with explicit author entity (sameAs to LinkedIn + Wikidata if any); (3) at least one HowTo for procedural intents; (4) Organization schema with sameAs network. For Hebrew queries, flag the AI Overview status as "monitor monthly — not consistently rolled out." Reddit/YouTube presence (even as third-party citations of the brand) is a leading indicator of AI-engine citability and should be added as a non-link tactic.

**Sources:**
- [Averi.ai — AI Overviews 48% citation playbook 2026](https://www.averi.ai/blog/google-ai-overviews-optimization-how-to-get-featured-in-2026)
- [Digital Strategy Force — Schema for ChatGPT and AI Mode 2026](https://digitalstrategyforce.com/journal/what-schema-markup-gets-you-cited-by-chatgpt-and-google-ai-mode-in-2026/)
- [Yext — How ChatGPT, Perplexity, Gemini, Claude decide what to cite](https://www.yext.com/blog/how-chatgpt-perplexity-gemini-claude-decide-what-to-cite)
- [Lantern — 10 most-cited domains across AI engines](https://www.asklantern.com/blogs/10-most-cited-domains-across-chatgpt-perplexity-gemini-and-claudee-here-s-the-pattern)
- [Google blog — AI Overviews 200+ countries May 2025](https://blog.google/products-and-platforms/products/search/ai-overview-expansion-may-2025-update/)

---

## Section 3: Ranking Factors Map (2026)

Google's public stance is "hundreds of signals plus many more variations." The 2024 leak documented 14,000+ features in the Content Warehouse API — many are intermediate or derivative signals. What follows is the **operationally-weighted map for 2026**: the 65 signals that an SEO practitioner should treat as load-bearing. Each is currently active (verified against 2025–2026 sources) and not a legacy artifact.

### 3.1 Content Quality (13 signals)

| # | Signal | Notes |
|---|---|---|
| 1 | Information gain / originality | Net-new info beyond competitors. Top driver post-March 2024. |
| 2 | First-hand experience markers | First-person, specific numbers, original screenshots/data. |
| 3 | Semantic completeness | Can answer the query without external sources. |
| 4 | Topic depth (siteFocusScore) | Per-leak: cluster coverage, not isolated posts. |
| 5 | Entity density on page | 15+ Knowledge Graph entities = 4.8× AI citation boost. |
| 6 | Multi-modal richness | Text + image + video = +156% AI Overview selection. |
| 7 | Author attribution + bio | E-E-A-T anchor; required for AI Overview author signals. |
| 8 | Citations to authoritative sources | Outbound links to .gov/.edu/Wikipedia-class. |
| 9 | Freshness — last meaningful update | Page-one results avg 730 days since update; AI-cited content is 25.7% fresher. |
| 10 | Content length appropriate to intent | Not raw length — fit to intent ladder. |
| 11 | Readability + structure (H2/H3, lists, tables) | Citable-chunk structuring. |
| 12 | Stat attribution with source | Required for AI engine trust scoring. |
| 13 | No scaled-content fingerprint | Identical structure across pages = SpamBrain flag. |

### 3.2 E-E-A-T Signals (10 signals)

| # | Signal | Notes |
|---|---|---|
| 14 | Author entity disambiguation | sameAs to LinkedIn, Wikidata, Crunchbase. |
| 15 | Author topical history | Past coverage on same niche. |
| 16 | Site topical consistency (siteFocusScore) | Leak-confirmed. |
| 17 | Unlinked brand mentions on authority sites | LLM-detected since 2024–2025. |
| 18 | Branded search density | Direct ranking input; halo channel. |
| 19 | About/Contact/Editorial policy pages | Trust scaffolding. |
| 20 | Author credentials surfaced | Bio + qualifications + photo. |
| 21 | Customer reviews/ratings on Google | Trust + local rank input. |
| 22 | YMYL handling (health, finance, legal) | Higher E-E-A-T bar in QRG. |
| 23 | Original research/data publication | Highest digital-PR + AI-citation magnet. |

### 3.3 Technical SEO (10 signals)

| # | Signal | Notes |
|---|---|---|
| 24 | HTTPS | Baseline. |
| 25 | Mobile-friendliness / responsive design | Baseline since 2018. |
| 26 | INP <200ms | 2026 CWV — tiebreaker. |
| 27 | LCP <2.5s | 2026 CWV — tiebreaker. |
| 28 | CLS <0.1 | 2026 CWV — tiebreaker. |
| 29 | Crawl budget hygiene | Robots, sitemaps, canonical, noindex on thin pages. |
| 30 | Indexation discipline | Quality > coverage post-HCS. |
| 31 | Structured data validity | Schema parse without errors. |
| 32 | hreflang implementation | Critical for IL bilingual sites (he/en). |
| 33 | Site speed (TTFB, render) | UX + crawl efficiency. |

### 3.4 User Signals (7 signals — NavBoost surface)

| # | Signal | Notes |
|---|---|---|
| 34 | lastLongestClick | Final clicked result in journey with dwell. |
| 35 | goodClicks vs badClicks | Per leak. |
| 36 | Pogo-sticking (return to SERP) | Negative ranking pressure. |
| 37 | Branded search density on the site | Distinct ranking channel. |
| 38 | Return visits | Repeat-visit signal. |
| 39 | Chrome aggregated user data | Per leak — used for site quality. |
| 40 | Session depth on landing | Engagement proxy. |

### 3.5 Backlink Signals (10 signals)

| # | Signal | Notes |
|---|---|---|
| 41 | Referring domain count | Still load-bearing. |
| 42 | Domain authority of referring sites | Editorial DR matters. |
| 43 | Topical relevance of referring page | More weighted than raw DR. |
| 44 | Anchor text distribution naturalness | Exact-match commercial = SpamBrain red flag. |
| 45 | Link velocity vs profile size | Sudden spikes flagged. |
| 46 | Link freshness | Recent links signal ongoing relevance. |
| 47 | Editorial vs non-editorial placement | Digital PR > paid placements. |
| 48 | nofollow/sponsored attribution correctness | Required for paid partnerships. |
| 49 | Geographic relevance of links | IL-domain links for IL ranking lift. |
| 50 | Internal link structure (hub-and-spoke) | +30–43% organic traffic per cluster studies. |

### 3.6 Brand Signals (6 signals)

| # | Signal | Notes |
|---|---|---|
| 51 | Branded search volume | Direct + halo input. |
| 52 | Unlinked brand mentions | LLM-detected. |
| 53 | Brand entity in Knowledge Graph | Knowledge Panel = trust marker. |
| 54 | Brand co-occurrence with category terms | "[brand] + [vertical]" co-search density. |
| 55 | Social brand mentions (YouTube, Reddit, LinkedIn) | Drives AI citation eligibility. |
| 56 | Wikipedia entry (where eligible) | Strongest entity anchor. |

### 3.7 Local SEO Signals (9 signals — Whitespark 2026 weighting)

| # | Signal | Local Pack weight |
|---|---|---|
| 57 | Google Business Profile completeness + activity | 32% |
| 58 | On-page signals (NAP, schema, city pages) | 19% |
| 59 | Review signals (count, velocity, sentiment, response) | 16% |
| 60 | Link signals (local + topical) | 15% |
| 61 | Behavioral signals (CTR, GBP clicks, calls) | 8% |
| 62 | Citation signals (NAP consistency across directories) | 7% |
| 63 | Personalization | 3% |
| 64 | Distance from searcher | Hard input, not earnable. |
| 65 | Categorization in GBP | Sub-component of GBP — primary + secondary categories. |

### 3.8 Schema/Entity Signals (subset of above; aggregate weight rising)

Top-impact schemas, ranked by 2026 AI Overview citation lift and rich-result eligibility (verified against multiple 2026 studies):

1. **Organization** (with full sameAs network) — entity-disambiguation foundation. No SERP feature, large AI-citation effect.
2. **LocalBusiness** — supersedes Organization for local. Drives Knowledge Panel + Local Pack.
3. **FAQPage** — highest AI Overview citation rate per page; "People also ask" inclusion.
4. **HowTo** — procedural-query citation magnet.
5. **Article / BlogPosting** — author entity + dateModified critical.
6. **Product / Review** — e-com SERP features; AggregateRating drives local trust.
7. **BreadcrumbList** — minor SERP polish; not a strong AI signal.

### 3.9 Cross-channel signals (paid → organic, social, YouTube)

See Section 6.

**Implication for Monthly Plan Generator:** Plan recommendations should map to this signal taxonomy. For each signal category, the plan should output: (a) current state diagnostic; (b) top-2 weighted gaps; (c) the action item. Do not output a generic "improve technical SEO" — output "INP=320ms on /pricing → tiebreaker risk." Never propose >5 distinct categories of work in a single month — pick the 2–3 highest-weighted gaps relative to the client's vertical (local = GBP-first; e-com = product schema + reviews; informational = entity + FAQ + AI Overview).

**Sources:**
- [Page One Power — 14,000 leaked features](https://www.pageonepower.com/linkarati/leaked-documents-reveal-over-14000-google-search-ranking-features)
- [Whitespark 2026 Local Search Ranking Factors](https://whitespark.ca/local-search-ranking-factors/)
- [Hobo — Definitive on-page after the leak](https://www.hobo-web.co.uk/on-page-seo/)
- [Hybrid Traffic — User behavior signals 2026](https://www.hybridtraffic.net/how-user-behavior-signals-impact-google-rank)
- [Aumcore — EEAT, brand authority, trust signals 2026](https://www.aumcore.com/blog/eeat-brand-authority-and-trust-signals-what-drives-google-rankings-in-2026/)

---

## Section 4: AEO / GEO — LLM-Era Optimization

AEO (Answer Engine Optimization) and GEO (Generative Engine Optimization) describe the same goal seen from two angles: making a page **citable by an LLM** when it answers a user query. The mechanics differ from classic SEO because LLMs do not rank — they extract, summarize, and attribute. The 2026 reality is that ChatGPT, Perplexity, Claude, Gemini, and Google AI Overviews each weight slightly different inputs, but five conditions are common across all five.

### Schema priorities for LLM extraction (2026 empirical ranking)

Verified across multiple 2026 studies, with citation-lift effect sizes:

| Schema | AI Overview lift | Notes |
|---|---|---|
| **Organization (with sameAs network)** | Large (entity anchor) | Foundation — without it the brand is "unknown entity" |
| **LocalBusiness** | Very large (local) | Replaces Organization for service-area + brick-and-mortar |
| **FAQPage** | Highest per-page | 40–60 word answers extracted verbatim |
| **HowTo** | High (procedural) | Step structure maps to AI synthesis pattern |
| **Article / BlogPosting** | Medium-high | Author + dateModified are the leverage |
| **Product** | High (commercial) | + Review/AggregateRating drives Shopping AI Mode |
| **Review** | Medium-high | UGC bias makes this disproportionately impactful for Claude |
| **BreadcrumbList** | Low | SERP polish, not AI leverage |

**Combo effect:** Article + FAQPage + HowTo + Organization on the same page → 2.5–2.7× citation probability vs no-schema baseline.

### Content structuring for citable chunks

LLMs extract **discrete passages**, not pages. Optimal chunking:

- **Q&A sections:** explicit question as H2/H3 + 40–60 word answer immediately below. This is the format with the highest extraction rate.
- **Comparison tables:** AI engines reproduce tables verbatim when they're parseable HTML. Markdown-to-HTML tables work; image-based comparisons do not.
- **Stat blocks:** "X% of Y do Z" with attribution `(Source: [name], [year])` in the same paragraph or immediately after.
- **Definition leads:** the first 50–80 words of a section should self-contain the definition. LLMs often quote the lead paragraph.
- **Numbered procedural lists:** for HowTo content. Step 1, Step 2, … with imperative verbs.
- **Section length:** 150–400 words per H2 block is the citation sweet spot. Over 400 words → less likely to be extracted as a unit.

### Entity disambiguation — operational checklist

1. **Organization schema with full sameAs:** website, Wikidata (create one if eligible), Crunchbase, LinkedIn company page, Facebook page, official YouTube channel, GitHub (if relevant), industry-specific authority directories.
2. **NAP citations across IL directories:** B144, Golden Pages (Dapei Zahav), Zap, Easy, Walla Local, plus vertical-specific (Yad2 for real estate; Restaurants.co.il etc).
3. **Google Business Profile:** identical NAP, primary + secondary categories, services list, posts, photos with EXIF location.
4. **Knowledge Panel triggers:** Wikipedia entry (where editorial threshold passable), Wikidata entry, prominent unlinked mentions on news media.
5. **Author entities:** sameAs from author bio pages to LinkedIn, Twitter/X, Mastodon if relevant, conference talk pages, peer-reviewed publications.

### How LLMs decide what to cite — convergence + divergence

**Shared across ChatGPT/Claude/Perplexity/Gemini/AI Overview:**
- Reddit is the #1 source (~40% citation frequency across engines).
- YouTube is the most-cited domain by 2× margin.
- Wikipedia is foundational for entity disambiguation.
- Freshness matters more for AI engines than for Google (cited content is 25.7% fresher on average).
- E-E-A-T author signals — 96% of citations come from pages with explicit author credentials.

**Engine-specific:**
- **ChatGPT:** Wikipedia 47.9% citation rate. Industry-specific official sites spike (hotels 38.08% in hospitality vertical). Browsing mode required for live citations.
- **Perplexity:** Reddit 46.7%. Most stable citation behavior across verticals. Always cites — live retrieval is core.
- **Claude:** UGC bias 2–4× higher than other engines. Food & Beverage vertical: UGC ~10× more than Gemini. Won't cite unless asked or given source material (web tool).
- **Gemini / AI Mode:** Similar profile to AI Overview but with lower UGC share. Heavy reliance on Knowledge Graph entities.

### Anti-pattern: AI-generated content that kills rankings vs. fine

**Kills rankings:**
- 50–500 AI-generated articles/day across keyword clusters.
- Identical structure / near-duplicate boilerplate across hundreds of pages.
- No first-hand experience markers, no original screenshots/data.
- No human editorial review layer.
- Thin factual depth, surface-level rewording of competitor content.
- Programmatic landing pages with template-only differentiation (no entity-level uniqueness).

**Fine / often beneficial:**
- AI-assisted drafting with human editorial layer.
- 50–100 AI articles with human editing → studied +30–80% traffic.
- AI used for outline, research synthesis, formatting.
- AI used to translate / localize human-authored content (with native review).
- AI used to maintain freshness on existing high-performers (revising stats, examples).

**Google's stated position:** scaled-content abuse policy targets *content that provides no value to users regardless of production method*. AI is not the trigger — value gap is.

**Implication for Monthly Plan Generator:** For every recommended content piece, the plan must specify: (a) FAQPage schema with at least 4 Q&A blocks at 40–60 words each; (b) author entity assigned; (c) at least one original data point, screenshot, or stat block with attribution; (d) section-length budget (150–400 words per H2); (e) entity coverage target (15+ KG entities for AI Overview eligibility on informational queries). For programmatic/templated pages, require entity-level uniqueness criteria (per-page unique data, not just unique words).

**Sources:**
- [Digital Strategy Force — Schema for ChatGPT and AI Mode 2026](https://digitalstrategyforce.com/journal/what-schema-markup-gets-you-cited-by-chatgpt-and-google-ai-mode-in-2026/)
- [Yext — How LLMs decide what to cite](https://www.yext.com/blog/how-chatgpt-perplexity-gemini-claude-decide-what-to-cite)
- [Wellows — AI Overviews ranking factors 2026](https://wellows.com/blog/google-ai-overviews-ranking-factors/)
- [Pravin Kumar — Google AI content myth 2026](https://www.pravinkumar.co/blog/google-ai-content-penalty-myth-what-actually-matters-2026)
- [Quattr — AI search & content freshness](https://www.quattr.com/blog/content-freshness)
- [Stackmatix — Organization schema + Knowledge Graph](https://www.stackmatix.com/blog/organization-schema-knowledge-graph)

---

## Section 5: Link Building 2026

> Budget scenarios (Smart ₪1K/mo + Aggressive ₪3K/mo) are pre-calibrated — see `project_link_strategy_scenarios.md`. This section covers the *quality framework* the generator should reference when prescribing tactics.

Google's 2026 position on links is a continuation of the December 2022 link spam update direction: **SpamBrain neutralizes 99%+ of manipulative link signals automatically**. The strategic implication is that "bad links" are mostly a non-issue (ignored, not penalized), but earning *real* editorial links has become harder and more valuable. Digital PR has overtaken guest posting as the highest-ROI tactic in 2025–2026 SEO industry surveys.

### What counts as "natural" in 2026

- **Editorial citation in news/industry media.** A journalist independently linked you = highest signal.
- **Resource-list inclusion** from authority sites in your topic graph.
- **Niche edits** (links inserted into existing, aged articles) — natural when they're contextually relevant and pass editorial review; spam when bulk-inserted into irrelevant pages.
- **User-generated links** from Reddit, Stack Exchange, GitHub, niche forums — when earned through genuine participation.
- **Brand mentions** (even unlinked) on authority sites — now an active signal.

### What counts as "manipulative" in 2026

- Paid links passing PageRank without nofollow/sponsored attribution.
- Exact-match commercial anchor as the dominant pattern.
- PBNs (private blog networks) — fingerprintable, SpamBrain target.
- Bulk guest posting on low-quality "guest-post-only" sites.
- Widget links with embedded keyword anchors distributed across unrelated sites.
- Scaled niche edits on irrelevant pages.

### Velocity safe zones

There is no public Google threshold, but practitioner consensus (2024–2026):

| Existing profile size (referring domains) | Safe new RDs/month |
|---|---|
| 0–50 | 1–5 |
| 50–200 | 3–15 |
| 200–1,000 | 10–40 |
| 1,000+ | 30+ (proportional) |

Sudden 10× spikes vs baseline = pattern-recognition flag. Most penalties come from velocity + anchor anomaly co-occurrence, not from either alone.

### Anchor distribution — current safe ratios (2026 practitioner consensus)

| Anchor type | Safe % range |
|---|---|
| Branded (company name) | 40–60% |
| Naked URL / generic ("click here," "this site") | 15–25% |
| Partial-match (brand + keyword combo, or keyword in long-form) | 10–20% |
| Exact-match commercial keyword | **2–8% maximum** |
| Image anchor (alt-text driven) | 5–15% |

Exact-match >10% sustained = highest-confidence SpamBrain manipulation signal. The bias should be heavily branded for any new or growing profile.

### Disavow tool — when still useful

For 99% of sites: **not necessary**. SpamBrain handles it. Use disavow only when:
1. **Manual action notice in GSC** specifically citing unnatural links.
2. **Pre-emptive cleanup** before a reconsideration request or major migration.
3. **Known history of deliberate scheme participation** that the site owner is unwinding.
4. Otherwise, ignore the disavow tool. Mueller's 2026 guidance: "it's in the spammer's best interest to encourage others to waste time disavowing" — Google already ignores the bad links.

### Local citations (NAP) — still weighted for local

Whitespark 2026 puts citation signals at **7% of Local Pack weight** — meaningful but secondary to GBP (32%) and reviews (16%). NAP **consistency** is the actual factor — small variations across directories suppress rankings. For IL market, the priority directory tier:

**Tier 1 (always do):**
- Google Business Profile (this is THE channel for local).
- B144.co.il (Bezeq's directory; broad IL coverage; high authority).
- Dapei Zahav / Golden Pages (`d.co.il`) — legacy authority, still indexed heavily.
- Zap.co.il — strong IL consumer signal.
- Walla Local pages — strong domain authority halo.

**Tier 2 (vertical-dependent):**
- Yad2.co.il — real estate, automotive, second-hand verticals.
- Restaurants.co.il / Rest.co.il — F&B vertical.
- Easy.co.il — services vertical.
- ModiinApp / regional apps — geo-local verticals.

**Tier 3 (international, lower priority for IL ranking but useful for entity disambiguation):**
- Crunchbase, LinkedIn, Facebook, Bing Places, Apple Maps.

### Digital PR vs niche edits vs guest posts — 2026 quality-weighted

| Tactic | Avg DR earned | Cost/link | Authority signal | Brand mention signal | AI citation lift | Risk |
|---|---|---|---|---|---|---|
| **Digital PR (campaign-driven)** | 70+ | $300–$750 | Highest | Very high (brand mentioned in story) | High | Low |
| **Editorial guest posts (real outlets)** | 30–50 | $150–$500 | Medium-high | Medium | Medium | Low–medium |
| **Niche edits on aged authority pages** | 30–60 | 30–50% of guest-post cost for equivalent DR | Medium-high (instant — page already crawled) | Low | Medium | Medium (if irrelevant) |
| **Bulk guest posting (guest-only sites)** | <30 | $50–$150 | Low | Negligible | Negligible | High |
| **Brand-mention earning (HARO, journalists)** | 50–80 | Time investment | Medium | Highest | Highest | Lowest |

**Recommended 2026 budget split** (when budget allows >₪3K/mo): 60–70% digital PR / brand mentions for authority + AI visibility; 30–40% guest posts or niche edits for targeted page-level support.

**Implication for Monthly Plan Generator:** Never recommend exact-match anchor strategies. Default anchor distribution: branded ≥50%, naked/generic 15–25%, partial 10–20%, exact ≤5%. For IL clients, always include the Tier-1 citation directory list in the first 90 days (one-time foundation). Prioritize digital-PR-style tactics (data publication, journalist outreach) over bulk-link tactics. Do not recommend disavow unless the client has a manual action.

**Sources:**
- [Blue Tree Digital — Google backlink policy 2026](https://bluetree.digital/google-backlink-policy/)
- [ALM Corp — Disavow Tool in 2026](https://almcorp.com/blog/google-disavow-tool/)
- [Editorial.link — Guest posts vs niche edits 2026](https://editorial.link/guest-post-vs-niche-edits/)
- [Reporter Outreach — Digital PR vs guest posting](https://www.reporteroutreach.com/blog/digital-pr-vs-guest-posting)
- [Whitespark 2026 — Citation factors](https://whitespark.ca/local-search-ranking-factors/)

---

## Section 6: Paid → Organic Synergy Mechanisms

Sergei specifically flagged this section — the platform's plan generator must recommend paid spend in a way that compounds organic returns. The 2026 evidence base is meaningfully stronger than it was in 2022–2023, partly because incrementality testing has become a standard measurement layer at agencies.

### Verified mechanisms (multiple 2025–2026 sources)

**1. Branded search amplification.** Paid awareness media (display, social, video, paid search) drives unaided brand recall, which translates into branded search density. Branded search is *itself* a direct ranking input (per the 2024 leak — Google tracks branded-query volume as a quality signal). When a brand's paid media goes dark, total related searches to the brand name contract within 2–4 weeks — verified in 2025–2026 incrementality studies.

**2. Navigational query lift.** Paid traffic to a high-quality LP that drives return visits trains NavBoost-style user signals: longer dwell on the brand's URL after subsequent organic searches, higher CTR from organic positions for the same query stack. Anecdotal-to-empirical: most digital-marketing case studies report 10–30% organic CTR lift on brand+category queries during sustained paid activity.

**3. SERP CTR pattern signaling.** High CTR from organic positions feeds rank stability through NavBoost (per the leak). Paid presence on the same SERP raises total SERP attention to the brand, indirectly lifting organic CTR. (Anecdotal — most-studied mechanism, hardest to isolate causally.)

**4. YouTube → Google + YouTube spillover.** A YouTube video with strong watch-time and CTR ranks both inside YouTube and inside Google's video carousel and Discussions/Forums sections. Video results are **50× more likely than text-based results** to rank organically in Google. AI engines cite YouTube at 2× the rate of the next domain. **YouTube ads** that drive views on the brand's owned channel compound this — when paid views accelerate watch-time on the brand's video, the video's organic rank stabilizes within YouTube and reflects into Google.

**5. Local Ads → GBP impressions.** Local Service Ads and standard Google Ads on the same geographic terms increase GBP impression volume, which feeds GBP behavioral signals (8% of Local Pack weight per Whitespark). Local ads also drive review velocity (clicks → calls → service → review request).

**6. Social-to-search halo.** Social content (organic + paid) drives branded search volume, which Google's algorithms register as a quality/relevance proxy. This is the most-cited halo channel in 2025–2026 (multiple Search Engine Land and Amsive case studies).

### Halo magnitude — case-study benchmarks

- **Amsive 2026 dark-test:** Paid media accounted for ~28% of incremental site traffic + ~23% of online orders. When paused, total branded queries contracted measurably within weeks.
- **TVScientific cross-platform:** Connected-TV ads measurably lift paid search and organic search performance — separately measurable through incrementality holdouts.
- **Mountain CTV study:** CTV exposure creates a "halo effect" for paid search and social — repeated and ad-platform-replicated.

### What's verified vs anecdotal in 2026

| Mechanism | Verification level |
|---|---|
| Paid awareness → branded search density → ranking input | **Verified** (leak + incrementality studies) |
| YouTube paid views → organic YouTube rank | **Verified** (algorithm publicly documented + studies) |
| Local Ads → GBP impressions → Local Pack behavioral signal | **Verified** (Whitespark + Google docs) |
| High CTR from organic positions feeding rank stability | **Verified** (leak — NavBoost goodClicks) |
| Paid presence on SERP → organic CTR lift | **Anecdotal / mixed** (correlation strong, causality contested) |
| Social paid → branded search | **Verified** (multiple 2026 studies) |
| TV/CTV → paid search lift | **Verified** (incrementality testing at scale) |
| TV/CTV → organic SEO lift directly | **Anecdotal** (likely via branded-search channel, not direct) |

**Implication for Monthly Plan Generator:** When the client runs paid (Google Ads, Meta, YouTube), the plan should not treat paid and organic as separate silos. Recommend: (a) organic LP variants for the same query clusters paid is targeting (capture branded follow-up); (b) GBP optimization sync with Local Ads geo-targeting; (c) YouTube SEO (titles, chapters, transcripts) for any video assets running as ads; (d) monitor branded-search-volume delta as a leading indicator of paid-organic compound effect. Avoid claiming direct ranking lift from paid spend — claim it through the documented channels (branded search, NavBoost, GBP signal).

**Sources:**
- [Search Engine Land — Halo effect: when paid media goes dark](https://www.searchenginejournal.com/the-halo-effect-your-paid-media-went-offline-can-you-survive-without-it/565464/)
- [Search Engine Land — Social content drives branded search](https://searchengineland.com/social-content-drives-branded-search-467551)
- [Amsive — When paid media goes dark, case study](https://www.amsive.com/insights/digital-media/when-paid-media-goes-dark-a-halo-effect-case-study/)
- [SEOYodha — Measuring halo effect of brand searches on organic](https://seoyodha.com/how-do-you-measure-the-halo-effect-of-brand-searches-on-organic-traffic/)

---

## Section 7: Continuous Evaluation Framework

For "качественные результаты" the platform must produce a monitoring rhythm that catches algorithm hits, content decay, and competitive shifts before they translate to traffic loss. Two layers: weekly tactical and monthly strategic.

### Weekly checks (automatable from DFS + GSC)

| Metric | Threshold for action |
|---|---|
| Top-3 ranking count delta | Drop ≥3 positions = investigate page |
| Top-10 ranking count delta | Drop ≥5 positions on any tracked keyword = SERP feature check |
| Organic clicks delta (7d vs prior 7d) | Drop ≥20% = correlate to algo update calendar |
| Organic impressions delta | Drop ≥30% = check indexation, deindexation, manual action |
| CTR by query group | Drop ≥30% = SERP feature change (new AI Overview, new ad, new sitelink) |
| Indexation status | Any newly excluded "Crawled - not indexed" / "Discovered - not indexed" |
| INP / LCP / CLS regressions | Any field-data metric crossing into "needs improvement" |
| Branded search volume | Drop ≥15% = upstream brand issue or paid pause |

### Monthly retro (cluster-by-cluster)

- **Intent-cluster winners/losers:** which of the 7 intent buckets gained or lost share?
- **Content decay scan:** pages with positions 4–15 that lost ≥3 positions in 90d → refresh candidates (quarterly refresh = +42% better results vs annual).
- **Competitor backlink gap:** new RDs to top-3 competitors not yet to client.
- **Schema validation health:** Search Console Enhancements report; new errors flagged.
- **AI Overview / SGE / Citation tracking:** monitor brand citation in ChatGPT / Perplexity / Gemini / AI Overview for tracked queries.
- **Conversion rate by landing page:** if rank holds but conversion drops → UX/intent-match issue, not SEO.
- **Local Pack visibility (for local clients):** Local Falcon-style grid; track pack position by ZIP/geo.

### Anomaly thresholds (Sergei's framework, codified)

| Anomaly | Threshold | Action |
|---|---|---|
| Rank drop on tracked keyword | ≥5 positions in 7d | Investigate page + SERP layout |
| Organic clicks drop | ≥20% in 7d | Correlate to algo update calendar |
| CTR drop on existing position | ≥30% | SERP feature change check (AI Overview likely) |
| Indexation drop | ≥5% of indexed URLs | Coverage report deep dive |
| Branded search drop | ≥15% in 30d | Paid pause check, reputation check |
| New RD spike on competitor | >3× baseline | Backlink gap report + counter |
| Content decay (rank slip) | ≥3 positions over 90d on top-50 pages | Refresh ticket |

**Implication for Monthly Plan Generator:** Every monthly plan should include a "monitor next month" section that lists 5–10 tracked keywords with current position + threshold, plus the 3 highest-decay-risk URLs. The plan acts as a self-correcting loop — last month's "monitor" outputs feed this month's "investigate."

**Sources:**
- [Animalz / SlateHQ — content refresh strategy 2026](https://slatehq.com/blog/content-refresh)
- [Wordpattern — content decay & stat refresh](https://wordpattern.org/blogs/how-to-refresh-outdated-statistics-stats-for-better-rankings/)
- [Hybrid Traffic — User behavior signals 2026](https://www.hybridtraffic.net/how-user-behavior-signals-impact-google-rank)

---

## Section 8: 2026 IL Market Specifics

The Israeli SERP is structurally similar to global Google but with three differences that meaningfully change strategy: **Hebrew morphology**, **directory-citation tiers**, and **SERP feature density**.

### Hebrew language SEO nuances

- **Tokenization & morphology.** Hebrew is non-concatenative — verbs and nouns inflect with prefixes and suffixes that cannot be split by simple whitespace tokenization. Google's NLP handles modern Hebrew morphology well, but content authored with consistent root-form usage (and synonym variants like אחסון / אכסון, ייעוץ / יעוץ) reaches both surfaces. Practitioners should treat dialectal/spelling variants as separate keyword targets where DFS volume justifies it.
- **Definite-article ambiguity.** Tokens starting with `ב` / `ל` / `מ` carry two valid analyses (with or without ה definite marker). This is a soft signal — Google's parser handles it, but on-page consistency helps.
- **RTL technical:** `dir="rtl" lang="he"` on the `<html>` element is mandatory. Crawling and indexing are unaffected by RTL, but UX flow, bidirectional embeddings in mixed Hebrew/English content (numbers, product codes), and CSS logical properties (margin-inline-start, etc.) impact INP and CLS measurably.
- **hreflang:** Bilingual IL sites (he/en) must implement `hreflang="he-IL"` ↔ `hreflang="en-IL"` (and `x-default` if global). Common mistake: using `hreflang="he"` without country tag — works but loses geo targeting.
- **Hebrew alt text:** include both Hebrew and English alt where the image is referenced from English content. Google Image Search in IL is split — Hebrew-alt images surface in `.co.il` Hebrew queries; English-alt images surface in English queries from the same user.
- **Date format:** Israeli convention is DD/MM/YYYY in Hebrew content; ISO 8601 in schema. Mismatched date formats in `datePublished` / `dateModified` cause schema validation warnings.

### Israeli SERP behavior

- **Google market share in IL: ~98%.** Bing and DuckDuckGo are statistically irrelevant.
- **SERP feature density is high.** Knowledge Panels appear on most branded queries; Local Pack is pervasive for service queries (~70% of service-intent queries trigger a 3-pack); Discussions and Forums (often Reddit + IL-specific forums like Tapuz, BeOK) appear on most informational queries.
- **AI Overview:** Hebrew rollout is intermittent as of mid-2026 — monitor monthly, do not assume parity with English. Where it does appear, citation patterns favor Walla, Ynet, Calcalist, Mako, plus vertical-specific (Globes for business; TheMarker for finance; Saloona for women's interests).
- **YouTube prominence:** Strong in IL — YouTube videos appear in carousels on most how-to and product queries. Hebrew-language YouTube optimization is a meaningful organic-traffic channel.

### IL ranking factors that differ from English-language SEO

| Factor | IL-specific weight |
|---|---|
| `.co.il` domain | Direct geo signal — preferred for IL ranking; `.com` works but starts at disadvantage on Hebrew queries |
| Hebrew language content on the domain | Required for Hebrew SERP — `lang="he"` + actual Hebrew body content |
| IL business address in GBP | Required for Local Pack |
| Hebrew customer reviews on GBP | Stronger trust signal than English reviews for IL queries |
| IL-domain backlinks (`.co.il`, `.org.il`, `.gov.il`) | Disproportionate weight for IL ranking |
| Hebrew Wikipedia entry (he.wikipedia.org) | Entity-disambiguation anchor for IL searches |
| Israeli phone number prefix in NAP | +972 or 0X format — must match across citations |

### IL-specific structured data

- **Kosher certification:** No official Google schema for kosher certification, but consensus practice is to use `additionalProperty` on Product / Restaurant schema with `name: "Kosher Certification"` and `value: [certifier name]`. Surfaces in Knowledge Panel if Knowledge Graph builds entity confidence.
- **Hebrew alt text:** `alt` attribute should be in the same language as the surrounding body content. Mixed-language sites: alt language follows page primary language (set in `<html lang>`).
- **Currency:** ILS in schema (`priceCurrency: "ILS"`) — using USD or generic causes pricing miscategorization in Shopping AI Mode.
- **VAT-included pricing:** IL convention is VAT-included consumer pricing; declare `valueAddedTaxIncluded: true` in PriceSpecification to avoid Shopping feed warnings.

### IL directory citation tier (repeated from Section 5 for emphasis)

**Tier 1 (do for every IL client):**
- Google Business Profile, B144, Dapei Zahav (Golden Pages), Zap, Walla Local.

**Tier 2 (vertical-dependent):**
- Yad2 (real estate, automotive, second-hand), Restaurants.co.il (F&B), Easy (services), ModiinApp / regional apps.

**Tier 3 (entity disambiguation, not local-pack-driving):**
- Crunchbase, LinkedIn, Facebook, Apple Maps, Bing Places.

**Implication for Monthly Plan Generator:** Every IL client plan should default to Hebrew-primary content with optional English variants behind hreflang. Tier-1 directory NAP push is a Month 1 baseline (one-time, ~3 hours of work). When recommending YouTube as a channel, default to Hebrew titles + Hebrew chapter markers + Hebrew transcript — bilingual where the brand serves bilingual customers. Flag AI Overview status as "intermittent in he-IL — monitor monthly" rather than building plan around guaranteed AIO presence.

**Sources:**
- [Ranktracker — Complete guide for SEO in Hebrew](https://www.ranktracker.com/blog/a-complete-guide-for-doing-seo-in-hebrew/)
- [GTechMe — RTL SEO and UX optimization](https://www.gtechme.com/insights/right-to-left-seo-and-ux-optimization-guide/)
- [Argos Multilingual — Hebrew SEO complexities](https://www.argosmultilingual.com/blog/hebrew-seo)
- [Wikipedia — B144 (Bezeq's directory)](https://en.wikipedia.org/wiki/B144)
- [Wikipedia — Golden Pages (Dapei Zahav)](https://en.wikipedia.org/wiki/Golden_Pages)

---

## Appendix A — Cross-section signal weighting cheat sheet for plan generation

When ranking month-over-month recommendations, the generator should weight categories roughly as follows (general — adjust by vertical):

| Category | Weight on plan-month priority |
|---|---|
| Content quality + topical authority (S3.1 + S3.6 + topic clusters) | 30% |
| E-E-A-T / entity disambiguation (S3.2 + S4 entity) | 20% |
| AEO / schema (S4) | 15% |
| Backlinks / digital PR (S5) | 15% |
| Local SEO signals (S3.7 — local clients only; reweight to content for non-local) | 10–25% |
| Technical SEO / INP (S3.3) | 5–10% |
| User signals optimization (S3.4) | covered indirectly via content quality |
| Brand signals / paid-organic synergy (S6) | 5–10% |

If the client has critical technical issues (INP >500ms, no schema at all, no HTTPS, broken hreflang), those jump to top priority for one month.

## Appendix B — Refresh checklist for this document

This file should be re-verified quarterly:
- New core update? → Section 1.
- New leaked documents or Google admissions? → Section 3.
- AI Overview rollout changes in IL? → Section 2 + Section 8.
- New SpamBrain enforcement waves? → Section 5.
- INP threshold changes? → Section 1 + Section 3.3.
- New IL-specific Google features? → Section 8.
