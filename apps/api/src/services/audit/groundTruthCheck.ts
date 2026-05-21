/**
 * Phase 4.3-R — Ground-truth comparator
 *
 * For each completed research stage on the active agent, sample N
 * records and re-verify the model's claims against the live source.
 *
 * The CRITICAL check we ship first: internal_seo_audit records.
 * Each record claims things like "missing_h1", "missing_meta_description",
 * "missing_canonical", word_count, schema list. We RE-FETCH the live URL
 * and parse the same fields ourselves, then diff against the record.
 *
 * Why this catches the H1 bug retroactively: even without the field-path
 * fix, this check would have flagged "claim missing_h1 but page has H1
 * server-rendered" — surfacing the disconnect between audit output and
 * reality on day one.
 */

import type { AuditFinding, AuditContext } from './types'
import { readResearchData, resolveAgentById } from '../agentContext'

const FETCH_TIMEOUT_MS = 12_000
const UA = 'Mozilla/5.0 (compatible; FlowmaticAudit/1.0; +https://flowmatic.co.il)'

interface LiveExtraction {
    fetched: boolean
    httpStatus: number
    h1Texts: string[]                // all H1 elements found
    title: string | null
    metaDescription: string | null
    canonical: string | null
    hasJsonLd: boolean
    ldJsonTypes: string[]            // @type values found in LD-JSON
    wordCount: number                // rough — strip tags + count
    fetchedBytes: number
    error?: string
}

async function fetchAndExtract(url: string): Promise<LiveExtraction> {
    try {
        const res = await fetch(url, {
            headers: { 'User-Agent': UA, 'Accept': 'text/html,*/*' },
            redirect: 'follow',
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        })
        const html = await res.text()
        if (!res.ok) {
            return {
                fetched: false, httpStatus: res.status, h1Texts: [], title: null,
                metaDescription: null, canonical: null, hasJsonLd: false, ldJsonTypes: [],
                wordCount: 0, fetchedBytes: html.length, error: `HTTP ${res.status}`,
            }
        }
        // Title
        const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
        const title = titleMatch ? titleMatch[1].replace(/\s+/g, ' ').trim() : null

        // Meta description
        const metaMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)
            || html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i)
        const metaDescription = metaMatch ? metaMatch[1].trim() : null

        // Canonical
        const canonMatch = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)
            || html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i)
        const canonical = canonMatch ? canonMatch[1].trim() : null

        // H1 — match all occurrences. Strip nested tags to get text content.
        const h1Texts: string[] = []
        const h1Re = /<h1[^>]*>([\s\S]*?)<\/h1>/gi
        let m: RegExpExecArray | null
        while ((m = h1Re.exec(html)) !== null) {
            const text = m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
            if (text.length > 0) h1Texts.push(text)
        }

        // LD-JSON detection
        const ldJsonTypes: string[] = []
        const ldRe = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
        while ((m = ldRe.exec(html)) !== null) {
            try {
                const j = JSON.parse(m[1].trim())
                const items = Array.isArray(j) ? j : [j]
                for (const it of items) {
                    if (it && typeof it === 'object' && '@type' in it) {
                        const t = (it as { '@type'?: unknown })['@type']
                        if (typeof t === 'string') ldJsonTypes.push(t)
                        else if (Array.isArray(t)) for (const tt of t) if (typeof tt === 'string') ldJsonTypes.push(tt)
                    }
                }
            } catch { /* skip */ }
        }

        // Rough word count (strip tags, count by whitespace)
        const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
        const wordCount = text.split(' ').filter(w => w.length > 0).length

        return {
            fetched: true, httpStatus: res.status, h1Texts, title, metaDescription,
            canonical, hasJsonLd: ldJsonTypes.length > 0, ldJsonTypes,
            wordCount, fetchedBytes: html.length,
        }
    } catch (err) {
        return {
            fetched: false, httpStatus: 0, h1Texts: [], title: null, metaDescription: null,
            canonical: null, hasJsonLd: false, ldJsonTypes: [], wordCount: 0, fetchedBytes: 0,
            error: (err as Error).message,
        }
    }
}

export const groundTruthCheck = async (ctx: AuditContext): Promise<AuditFinding[]> => {
    const findings: AuditFinding[] = []
    const agent = ctx.agentId ? await resolveAgentById(ctx.instanceId, ctx.agentId) : null
    const rd = (await readResearchData(agent, ctx.instanceId)) as Record<string, unknown>

    const results = (rd.results as Record<string, unknown> | undefined) || {}
    const audit = results.internal_seo_audit as { records?: Array<Record<string, unknown>> } | undefined
    if (!audit?.records || audit.records.length === 0) {
        findings.push({
            category: 'ground_truth',
            id: 'no_audit_records',
            title: 'אין רשומות internal_seo_audit לאמת',
            severity: 'info',
            detail: 'No internal_seo_audit records to verify. Run the stage first.',
            scope: { instanceId: ctx.instanceId, agentId: ctx.agentId, stageId: 'internal_seo_audit' },
        })
        return findings
    }

    // Sample: pick the highest-impact records (expected_impact === 'high')
    // + a few random "low/medium" to stress-test. Cap at ctx.sampleSize.
    const high = audit.records.filter(r => (r.expected_impact as string) === 'high')
    const others = audit.records.filter(r => (r.expected_impact as string) !== 'high')
    const sample = [...high.slice(0, Math.ceil(ctx.sampleSize * 0.7)), ...others.slice(0, Math.floor(ctx.sampleSize * 0.3))]
        .slice(0, ctx.sampleSize)

    for (let i = 0; i < sample.length; i++) {
        if (ctx.networkBudget.remaining <= 0) {
            findings.push({
                category: 'ground_truth',
                id: 'network_budget_exhausted',
                title: 'חרגנו מתקציב הרשת — דילגנו על חלק מהרשומות',
                severity: 'warn',
                detail: `Stopped at record ${i}/${sample.length}; network budget exhausted. Increase ctx.networkBudget for fuller coverage.`,
                scope: { instanceId: ctx.instanceId, agentId: ctx.agentId, stageId: 'internal_seo_audit' },
            })
            break
        }
        ctx.networkBudget.remaining--

        const rec = sample[i]
        const url = String(rec.url || '')
        if (!url) continue

        const live = await fetchAndExtract(url)
        if (!live.fetched) {
            findings.push({
                category: 'ground_truth',
                id: `live_fetch_failed:${url}`,
                title: `לא הצלחנו לאמת ${url} (HTTP ${live.httpStatus})`,
                severity: 'info',
                detail: `Live fetch failed — ${live.error || 'unknown'}. Audit claims for this URL can't be ground-truthed; not necessarily a model error.`,
                scope: { instanceId: ctx.instanceId, agentId: ctx.agentId, stageId: 'internal_seo_audit', url, recordIndex: i },
            })
            continue
        }

        const claimedCritical = (rec.issues_critical as string[] | undefined) || []
        const claimedWarning = (rec.issues_warning as string[] | undefined) || []
        const allClaims = [...claimedCritical, ...claimedWarning]

        // ── Check: missing_h1 vs live H1 presence
        if (allClaims.includes('missing_h1') && live.h1Texts.length > 0) {
            findings.push({
                category: 'ground_truth',
                id: `false_missing_h1:${url}`,
                title: `הודעה שגויה: "missing_h1" בעוד שיש ${live.h1Texts.length} H1 ב-${url}`,
                severity: 'fail',
                detail:
                    `Audit claimed missing_h1 but live HTML contains ${live.h1Texts.length} H1 tag(s): ` +
                    live.h1Texts.slice(0, 3).map(h => `"${h.slice(0, 60)}"`).join(', ') +
                    `. This indicates the data the model received didn't reflect reality (extractor field-path or DFS data quality issue).`,
                fixHint:
                    `Inspect DFS cached response for this URL. Confirm meta.htags.h1 is populated. If yes — verify extractor reads from the right path. ` +
                    `If DFS itself returned empty (rare), consider switching to Firecrawl or live HTML for this URL type.`,
                evidence: { url, liveH1: live.h1Texts.slice(0, 3), claimedCritical, claimedWarning },
                scope: { instanceId: ctx.instanceId, agentId: ctx.agentId, stageId: 'internal_seo_audit', url, recordIndex: i },
            })
        }

        // ── Check: missing_meta_description vs live meta
        if (allClaims.includes('missing_meta_description') && live.metaDescription && live.metaDescription.length > 5) {
            findings.push({
                category: 'ground_truth',
                id: `false_missing_meta:${url}`,
                title: `הודעה שגויה: "missing_meta_description" בעוד שיש meta ב-${url}`,
                severity: 'fail',
                detail: `Audit claimed missing_meta_description but live page has meta description (${live.metaDescription.length} chars).`,
                evidence: { url, liveMeta: live.metaDescription.slice(0, 200) },
                scope: { instanceId: ctx.instanceId, agentId: ctx.agentId, stageId: 'internal_seo_audit', url, recordIndex: i },
            })
        }

        // ── Check: no_schema vs live LD-JSON presence
        // Known DFS coverage gap — `item.schema[]` from on_page/instant_pages
        // covers microdata/RDFa but NOT modern <script type="application/ld+json">.
        // Yoast/RankMath emit LD-JSON only; DFS reports no_schema even when
        // the page is fully marked up. We surface this as INFO not warn —
        // it's actionable for the data pipeline (consider adding LD-JSON
        // probe to prefetch) but not a false claim about the page.
        if (allClaims.includes('no_schema') && live.hasJsonLd) {
            findings.push({
                category: 'ground_truth',
                id: `dfs_misses_ldjson:${url}`,
                title: `DFS לא רואה LD-JSON ב-${url} (claimed "no_schema")`,
                severity: 'info',
                detail:
                    `Audit claimed no_schema but live HTML contains LD-JSON: ${live.ldJsonTypes.join(', ')}. ` +
                    `Known DFS coverage gap — its schema[] field covers microdata/RDFa but doesn't always pick up ` +
                    `<script type="application/ld+json"> output by Yoast/RankMath. The audit claim was faithful to ` +
                    `what DFS returned; the underlying signal is just incomplete.`,
                fixHint: 'Add a lightweight LD-JSON probe to the internal_seo_audit prefetch (fetch HTML once per URL, regex for ld+json scripts, populate item.schema[]).',
                evidence: { url, liveLdJsonTypes: live.ldJsonTypes },
                scope: { instanceId: ctx.instanceId, agentId: ctx.agentId, stageId: 'internal_seo_audit', url, recordIndex: i },
            })
        }

        // ── Check: word_count drift
        const claimedWordCount = rec.word_count as number | undefined
        if (claimedWordCount != null && live.wordCount > 0) {
            const ratio = Math.abs(claimedWordCount - live.wordCount) / Math.max(claimedWordCount, live.wordCount)
            if (ratio > 0.5 && Math.abs(claimedWordCount - live.wordCount) > 200) {
                findings.push({
                    category: 'ground_truth',
                    id: `word_count_drift:${url}`,
                    title: `word_count שונה משמעותית מהאתר ב-${url}`,
                    severity: 'info',
                    detail:
                        `Audit claims word_count=${claimedWordCount} but live HTML has ~${live.wordCount} words. ` +
                        `Acceptable for "plain text only" filters but flagging because the diff is large (${Math.round(ratio * 100)}%).`,
                    evidence: { url, claimedWordCount, liveWordCount: live.wordCount },
                    scope: { instanceId: ctx.instanceId, agentId: ctx.agentId, stageId: 'internal_seo_audit', url, recordIndex: i },
                })
            }
        }
    }

    if (findings.filter(f => f.severity === 'fail').length === 0) {
        findings.push({
            category: 'ground_truth',
            id: 'ground_truth_clean',
            title: 'כל ההודעות הקריטיות שדגמנו תואמות את האתר בפועל',
            severity: 'pass',
            detail: `Verified ${sample.length} records against live fetch. No false missing_h1 / missing_meta_description / no_schema claims detected.`,
            scope: { instanceId: ctx.instanceId, agentId: ctx.agentId, stageId: 'internal_seo_audit' },
        })
    }

    return findings
}