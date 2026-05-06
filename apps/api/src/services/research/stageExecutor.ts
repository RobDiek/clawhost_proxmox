/**
 * Stage executor — the shared agent-execution pipeline used by every
 * per-stage controller in controllers/hosting/research/stages/.
 *
 * Spec: docs/research-pipeline-design.md §7 + §9
 *
 * What it owns (lifted from the legacy `researchStage` in agentSetup.ts):
 *   1. Pre-flight workspace wipe + cross-tenant prune + BRAND.md restore
 *   2. Mem0 history clear
 *   3. Dispatch:
 *        - useDirectApi=true  → call Anthropic /messages directly
 *        - useDirectApi=false → run via openclaw CLI agent (Brave/DataForSEO/Firecrawl)
 *   4. Output parsing (strip plugin/diagnostic logs, extract longest payload)
 *   5. Chatter strip (preamble + simulated tool-call code blocks)
 *   6. Fallback tier A: read RESEARCH_STAGE<n>.md if agent saved-to-file
 *   7. Fallback tier B: aggregate assistant text from session jsonl
 *   8. Meta-leak detection (system status report instead of research)
 *   9. Fallback tier C: retry via direct Anthropic API (CLI path only)
 *
 * Why per-stage controllers use this:
 *   - Same defenses against agent flakiness across all stages
 *   - One place to evolve the parsing/validation contract
 *   - Surface-level signature stays small: prompt + a few options in,
 *     {content, source, status} out — controllers only deal with
 *     stage-specific business logic (prompt build + result save)
 */

import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { instances } from '@/db/schema'
import {
    sshExec,
    getApiKeyForInstance,
    getAvailableTools,
} from '@/controllers/hosting/agentSetup'
import type {
    StageId,
    StageResult,
    StageStatus,
} from './types'

// ── Per-instance research lock (prevents parallel runs) ─────────────────────
// Same TTL/semantics as the legacy researchStage — only one stage may execute
// against an instance at a time. Lock key = instanceId, value = startedAt.
const activeResearchRuns = new Map<string, number>()
const RESEARCH_LOCK_TTL = 360_000 // 6 min — covers longest expected stage

export function acquireResearchLock(instanceId: string): { acquired: boolean; secondsLeft?: number } {
    const lockedAt = activeResearchRuns.get(instanceId)
    if (lockedAt && Date.now() - lockedAt < RESEARCH_LOCK_TTL) {
        return { acquired: false, secondsLeft: Math.ceil((RESEARCH_LOCK_TTL - (Date.now() - lockedAt)) / 1000) }
    }
    activeResearchRuns.set(instanceId, Date.now())
    return { acquired: true }
}

export function releaseResearchLock(instanceId: string): void {
    activeResearchRuns.delete(instanceId)
}

// ── Detect "system status report" leaks ──
// Sayer occasionally produces a meta-status report instead of research:
// cron jobs / Telegram chat ID / integrations connected / plugins disabled —
// none of which belong in research output. Triggers a fallback retry.
const META_SIGNALS = /cron job|chat ID|chatId|MEMORY\.md|HEARTBEAT\.md|AGENTS\.md|SOUL\.md|CHANNELS\.md|TOOLS\.md|plugin (disabled|enabled)|config warning|integrations? (מחובר|לא מחובר|connected|not connected)|מצב המערכת|מצב כללי/i

function detectMetaLeak(text: string | undefined): boolean {
    if (!text) return false
    const head = text.slice(0, 1500)
    return META_SIGNALS.test(head) && (text.match(META_SIGNALS) || []).length >= 2
}

// Stage-id → legacy file name. Only used by the saved-to-file fallback.
// Stages without a legacy filename (new ones) won't match — fallback noop.
const LEGACY_STAGE_FILENAME: Partial<Record<StageId, string>> = {
    competitor_landscape:   'RESEARCH_STAGE1.md',
    seo_keyword_research:   'RESEARCH_STAGE2.md',
    audience_personas:      'RESEARCH_STAGE3.md',
    strategy_options:       'RESEARCH_STAGE4.md',
    validation:             'RESEARCH_STAGE5.md',
}

// ────────────────────────────────────────────────────────────────────────────

export interface ExecuteStageInput {
    /** Instance row — needs id, ip, rootPassword, researchData (for brand slug). */
    instanceId: string
    instance: {
        ip: string
        rootPassword?: string | null
        researchData?: unknown
    }
    /** Stable stage id used for logs + saved-file lookup. */
    stageId: StageId
    /** Pre-built prompt — caller owns prompt structure (per-stage prompts.ts). */
    prompt: string
    /**
     * Which agent runs this stage on the OpenClaw CLI path.
     * 'sayer' = research (web_search), 'menateach' = strategic analysis.
     */
    agentId: 'sayer' | 'menateach'
    /**
     * true  → call Anthropic /messages directly (analytical stages, no
     *         live web access needed). Bypasses workspace/SOUL.md context.
     * false → openclaw CLI agent (needs MCP tools: Brave/DataForSEO/Firecrawl).
     */
    useDirectApi: boolean
    /** Floor below which we treat the result as "too short" and run fallbacks. */
    minLength: number
    /** Resolved model id — e.g. 'anthropic/claude-sonnet-4-6' or 'claude-opus-4-7'. */
    model: string
}

export interface ExecuteStageOutput {
    /** Parsed, cleaned, validated markdown. Empty string ⇒ caller treats as failure. */
    content: string
    /** Provenance — where the bytes came from, surfaced in UI. */
    source: StageResult['source']
    /** Concrete integrations actually invoked (for UI provenance + audit). */
    integrationsUsed: string[]
    /** Final status — caller persists into plan.status. */
    status: StageStatus
    /** When non-empty content is missing, caller uses these to build error response. */
    httpCode?: 400 | 422 | 429 | 500
    errorMessage?: string
    /** Set by runStageGeneric after parsing the hybrid response — records[] from JSON block. */
    records?: unknown[]
    /** DFS USD cost across the stage's prefetch calls (logging only — tenant pays directly). */
    dfsCost?: number
    /** Section-level confidence rollup. */
    confidence?: 'high' | 'medium' | 'working_hypothesis'
    /** Self-critique gate outcome (Phase 3.5e). */
    qualityGate?: {
        pass: boolean
        hardFailures: string[]
        warnings: string[]
        revised: boolean
        skipped?: boolean
        /**
         * Phase 3.14 — hard failures the server resolved post-critic
         * (e.g. math_sanity dropped after recomputeCompetitorScorecards
         * overwrote `total` with the authoritative weighted sum). Audit
         * trail only; does NOT block `pass`.
         */
        autoCorrected?: string[]
    }
    /** Non-records JSON sibling fields (Phase 3.10b — our_link_profile, etc). */
    extras?: Record<string, unknown>
}

// ────────────────────────────────────────────────────────────────────────────

/**
 * Run one research stage. Idempotent at the SSH level — repeated calls always
 * wipe the workspace before re-running. Concurrency control is the caller's
 * job (use acquireResearchLock / releaseResearchLock around this).
 */
export async function executeStage(input: ExecuteStageInput): Promise<ExecuteStageOutput> {
    const { instanceId, instance, stageId, prompt, agentId, useDirectApi, minLength, model } = input

    // Brand slug for cross-tenant prune + BRAND.md restore. Same formula as
    // setupAgents — keep them in sync or this introduces drift.
    const rd = (instance.researchData as Record<string, unknown> | null) || {}
    const answers = (rd.answers as Record<string, unknown> | undefined) || {}
    const brandSource = String(answers.brandName || answers.businessName || '')
    const currentBrandSlug = brandSource
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '') || '__none__'

    // Detect available MCP tools — informs `integrationsUsed` for provenance.
    const tools = await getAvailableTools(instance.ip, instance.rootPassword || undefined)

    // ─── Pre-flight: clear all context sources ──
    // Why every run: "I already answered" cache, sibling-brand contamination,
    // stale workspace state. See agentSetup.ts:researchStage for full rationale.
    const mem0Key = process.env.MEM0_API_KEY
    if (mem0Key) {
        try {
            await fetch(`https://api.mem0.ai/v1/memories/?user_id=${instanceId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Token ${mem0Key}` },
            })
        } catch { /* best-effort */ }
    }
    try {
        await sshExec(instance.ip, `
            rm -rf /home/openclaw/.openclaw/agents/${agentId}/sessions/* 2>/dev/null
            rm -rf /home/openclaw/.openclaw/agents/${agentId}/output/* 2>/dev/null
            mkdir -p /home/openclaw/.openclaw/agents/${agentId}/sessions
            rm -rf /home/openclaw/.openclaw/workspace/content/* 2>/dev/null
            rm -rf /home/openclaw/.openclaw/workspace/memory/* 2>/dev/null
            rm -rf /home/openclaw/.openclaw/workspace/state/* 2>/dev/null
            rm -f /home/openclaw/.openclaw/workspace/STRATEGY.md 2>/dev/null
            if [ -d /home/openclaw/.openclaw/workspace/brands ]; then
                for d in /home/openclaw/.openclaw/workspace/brands/*/; do
                    slug=$(basename "$d")
                    if [ "$slug" != "${currentBrandSlug}" ]; then
                        rm -rf "$d" 2>/dev/null
                    fi
                done
            fi
            if [ -f "/home/openclaw/.openclaw/workspace/brands/${currentBrandSlug}/BRAND.md" ]; then
                cp "/home/openclaw/.openclaw/workspace/brands/${currentBrandSlug}/BRAND.md" /home/openclaw/.openclaw/workspace/BRAND.md
            fi
            chown -R openclaw:openclaw /home/openclaw/.openclaw/agents/${agentId} /home/openclaw/.openclaw/workspace 2>/dev/null
        `, instance.rootPassword || undefined, 15000)
        console.log(`[research/${stageId}] full context wipe + BRAND.md restored from brands/${currentBrandSlug}/`)
    } catch (err) {
        console.warn(`[research/${stageId}] pre-flight cleanup warning:`, (err as Error).message)
    }

    // ─── Dispatch ──
    let output = ''
    let isRateLimit = false
    let primarySource: 'anthropic' | 'mixed' = useDirectApi ? 'anthropic' : 'mixed'

    if (useDirectApi) {
        const apiKey = await getApiKeyForInstance(instanceId)
        if (!apiKey) {
            return {
                content: '', source: 'anthropic', integrationsUsed: [],
                status: { state: 'failed', failureReason: 'no_api_key' },
                httpCode: 400, errorMessage: 'מפתח API Anthropic לא מוגדר',
            }
        }
        const anthropicModel = model.replace(/^anthropic\//, '')
        try {
            const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01',
                },
                body: JSON.stringify({
                    model: anthropicModel,
                    // Phase 3.18 — bumped 16K → 32K. Phase (c) added cluster_architecture
                    // + cannibalization_audit + content_briefs to seo_keyword_research
                    // schema; with 20 records + full briefs the JSON output exceeded
                    // 16K and was truncated mid-record (records[]=0 in DB because
                    // hybridParser couldn't find the closing fence). 32K leaves
                    // headroom for that stage and any other "wide" stage.
                    max_tokens: 32000,
                    messages: [{ role: 'user', content: prompt }],
                }),
                signal: AbortSignal.timeout(300000),
            })
            if (apiRes.ok) {
                const data = await apiRes.json() as { content?: Array<{ text: string }> }
                output = data.content?.[0]?.text || ''
                console.log(`[research/${stageId}] direct API: ${output.length} chars via ${anthropicModel}`)
            } else {
                const errText = await apiRes.text()
                console.error(`[research/${stageId}] Anthropic API ${apiRes.status}: ${errText.substring(0, 300)}`)
                if (apiRes.status === 429) isRateLimit = true
            }
        } catch (apiErr) {
            console.error(`[research/${stageId}] API exception:`, (apiErr as Error).message)
        }
    } else {
        // OpenClaw CLI path — agent has access to Brave/DataForSEO/Firecrawl MCPs.
        const b64Prompt = Buffer.from(prompt).toString('base64')
        const sessionId = `research-${stageId}-${Date.now()}`
        const promptFile = `/tmp/research-prompt-${sessionId}.txt`
        await sshExec(instance.ip,
            `echo '${b64Prompt}' | base64 -d > ${promptFile} && chown openclaw:openclaw ${promptFile}`,
            instance.rootPassword || undefined,
        )
        output = await sshExec(instance.ip,
            `su - openclaw -c 'timeout 540 openclaw agent --agent ${agentId} --session-id ${sessionId} -m "$(cat ${promptFile})" --json 2>&1'; rm -f ${promptFile}`,
            instance.rootPassword || undefined,
            570000,
        )
    }

    // ─── Parse ──
    if (output.includes('rate_limit') || output.includes('Rate limit')) isRateLimit = true

    let result = ''
    const cleanOutput = output
        .split('\n')
        .filter(line => !line.startsWith('[plugins]') && !line.startsWith('[diagnostic]')
            && !line.startsWith('[model-fallback') && !line.startsWith('Config '))
        .join('\n')
        .trim()

    const jsonMatch = cleanOutput.match(/\{\s*"runId"/)
    const jsonStart = jsonMatch?.index ?? -1
    if (jsonStart === -1) {
        const mdMatch = cleanOutput.match(/^(#{1,3}\s.+)/m)
        result = mdMatch?.index !== undefined ? cleanOutput.slice(mdMatch.index) : cleanOutput
    } else {
        try {
            const agentResult = JSON.parse(cleanOutput.slice(jsonStart))
            result = agentResult?.result?.finalAssistantVisibleText || ''
            // ALWAYS check payloads — agents often emit a short ack as visible
            // text while the real work sits in payloads as the longest block.
            if (agentResult?.result?.payloads) {
                let bestPayload = ''
                for (const p of agentResult.result.payloads) {
                    if (p.text && p.text.length > bestPayload.length) bestPayload = p.text
                }
                if (bestPayload.length > result.length) result = bestPayload
            }
            if (!result) result = cleanOutput
        } catch {
            result = cleanOutput
        }
    }

    // ─── Sanitize ──
    result = result
        .replace(/\[plugins\].*\n?/g, '')
        .replace(/\[diagnostic\].*\n?/g, '')
        .replace(/\[model-fallback.*\n?/g, '')
        .replace(/\{"name":"[^"]+","blockChars":\d+\},?\n?/g, '')
        .replace(/Config warnings:.*\n?/g, '')
        .replace(/Config invalid.*\n?/g, '')
        .replace(/^\s*\[\s*\{[\s\S]*?"blockChars"[\s\S]*?\}\s*\]\s*$/gm, '')
        .trim()

    // ─── Strip "agent reasoning chatter" preamble ──
    // Common in direct-API path: model role-plays tool usage as text
    // ("I'll research…", "```brave_search …```") before the real report.
    {
        const headerIdx = result.search(/(^|\n)#{1,3}\s+\S/)
        if (headerIdx > 0 && headerIdx < 1500) {
            const preamble = result.slice(0, headerIdx)
            const looksLikeChatter =
                /^I['']?ll|Let me|I will|I am going to|I[''']?m going to/i.test(preamble.trim()) ||
                /```\s*(brave_search|firecrawl|dataforseo|web_search)[\s\S]*?```/i.test(preamble) ||
                /Let['']?s execute|searches efficiently|I[''']?ve gathered/i.test(preamble)
            if (looksLikeChatter) result = result.slice(headerIdx).replace(/^\n+/, '')
        }
        result = result.replace(/```\s*(brave_search|firecrawl|dataforseo|web_search)[\s\S]{0,300}?```\s*\n?/gi, '')
    }

    // ─── Fallback A: agent saved-to-file ──
    const legacyFile = LEGACY_STAGE_FILENAME[stageId]
    if (result.length < minLength && legacyFile && (result.includes('.md') || result.includes('שמורה'))) {
        try {
            const fileContent = await sshExec(instance.ip,
                `cat /home/openclaw/.openclaw/workspace/${legacyFile} 2>/dev/null || echo ""`,
                instance.rootPassword || undefined,
            )
            if (fileContent.length > minLength) result = fileContent
        } catch { /* best-effort */ }
    }

    // ─── Fallback B: assistant blocks from session jsonl ──
    if (!result || result.length < minLength) {
        try {
            const draft = await sshExec(instance.ip,
                `ls -t /home/openclaw/.openclaw/agents/${agentId}/sessions/*.jsonl 2>/dev/null | head -1 | xargs -r cat 2>/dev/null | python3 -c "
import json,sys
out=[]
for line in sys.stdin:
    try:
        j=json.loads(line)
        if j.get('type')=='message' and j.get('message',{}).get('role')=='assistant':
            for c in j['message'].get('content',[]):
                if isinstance(c,dict) and c.get('type')=='text':
                    t=c.get('text','').strip()
                    if len(t)>50: out.append(t)
    except: pass
print('\n\n'.join(out))
" 2>/dev/null || echo ""`,
                instance.rootPassword || undefined,
                20000,
            )
            if (draft && draft.trim().length > minLength) {
                console.log(`[research/${stageId}] session-draft fallback: ${draft.length} chars`)
                result = draft.trim()
            }
        } catch (e) {
            console.log(`[research/${stageId}] session-draft fallback failed:`, (e as Error).message)
        }
    }

    // ─── Meta-leak detection (CLI path) ──
    const metaLeak = !useDirectApi && detectMetaLeak(result)

    // ─── Fallback C: direct Anthropic API (CLI path only) ──
    if (!useDirectApi && (!result || result.length < 500 || metaLeak)) {
        console.warn(`[research/${stageId}] CLI gave ${metaLeak ? 'meta-leak' : 'short'} result (${result?.length || 0} chars) — fallback to direct API`)
        try {
            const apiKey = await getApiKeyForInstance(instanceId)
            if (apiKey) {
                const anthropicModel = model.replace(/^anthropic\//, '')
                const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-api-key': apiKey,
                        'anthropic-version': '2023-06-01',
                    },
                    body: JSON.stringify({
                        model: anthropicModel,
                        max_tokens: 16000,
                        messages: [{ role: 'user', content: prompt }],
                    }),
                    signal: AbortSignal.timeout(300000),
                })
                if (apiRes.ok) {
                    const data = await apiRes.json() as { content?: Array<{ text: string }> }
                    const directResult = data.content?.[0]?.text || ''
                    if (directResult && directResult.length >= 500) {
                        console.log(`[research/${stageId}] direct-API fallback OK: ${directResult.length} chars`)
                        result = directResult
                        primarySource = 'anthropic'  // CLI failed → fallback owns provenance
                    }
                }
            }
        } catch (fbErr) {
            console.error(`[research/${stageId}] direct-API fallback exception:`, (fbErr as Error).message)
        }
    }

    // ─── Final validation ──
    const metaLeakFinal = detectMetaLeak(result)
    if (!result || result.length < 500 || metaLeakFinal) {
        const lookedConfused = !!result && /STRATEGY\.md.*שייך ל|לא רלוונטי ל|פרויקט אחר|פרוייקט אחר|brand.*previous|other tenant/i.test(result.slice(0, 1500))
        const isShortAndOnlyMeta = !!result && result.length < 800 && /\bSession\b|workspace|MEMORY\.md|TOOLS\.md/i.test(result.slice(0, 800))

        let msg: string
        let httpCode: 400 | 422 | 429 | 500
        if (isRateLimit) {
            msg = `rate limit — המודל הגיע לגבול השימוש. נסו: המתינו דקה / שנו מודל / שדרגו תוכנית API`
            httpCode = 429
        } else if (metaLeakFinal) {
            msg = `הסוכן דיווח על מצב המערכת במקום לבצע מחקר. נסו שוב — אם נמשך, לחצו "איפוס הגדרות" באזור המסוכן.`
            httpCode = 422
        } else if (lookedConfused || isShortAndOnlyMeta) {
            msg = `הסוכן התבלבל בין פרויקטים. הסיבה הסבירה: קבצים ישנים מ-brand אחר נשארו בסביבת העבודה. פתרון: לחצו "איפוס הגדרות" באזור המסוכן ונסו שוב.`
            httpCode = 422
        } else {
            msg = `שלב המחקר נכשל — נסו שוב`
            httpCode = 500
        }
        return {
            content: '',
            source: useDirectApi ? 'anthropic' : 'mixed',
            integrationsUsed: [],
            status: { state: 'failed', failureReason: msg },
            httpCode,
            errorMessage: msg,
        }
    }

    // ─── Persist legacy RESEARCH_STAGE<n>.md file (downstream consumers) ──
    if (legacyFile) {
        try {
            const b64Result = Buffer.from(result).toString('base64')
            await sshExec(instance.ip,
                `mkdir -p /home/openclaw/.openclaw/research-data && echo ${b64Result} | base64 -d > /home/openclaw/.openclaw/research-data/${legacyFile} && chown -R openclaw:openclaw /home/openclaw/.openclaw/research-data`,
                instance.rootPassword || undefined,
            )
        } catch { /* best-effort */ }
    }

    // Build integrations-used list. CLI path → tools available; direct API path
    // → just anthropic. We can't easily verify which MCPs the agent actually
    // called (no telemetry from openclaw CLI), so we report what was *available*.
    const integrationsUsed = primarySource === 'anthropic'
        ? ['anthropic']
        : [
            ...(tools.hasBrave ? ['brave'] : []),
            ...(tools.hasDataforseo ? ['dataforseo'] : []),
            ...(tools.hasFirecrawl ? ['firecrawl'] : []),
            'anthropic',
        ]

    return {
        content: result,
        source: primarySource,
        integrationsUsed,
        status: {
            state: 'completed',
            runAt: new Date().toISOString(),
        },
    }
}

// ────────────────────────────────────────────────────────────────────────────

/**
 * Persist a successful stage result onto researchData.results[stageId] +
 * update plan.status[stageId]. Single source of truth for the write — every
 * per-stage controller uses this so we never drift on the JSON shape.
 *
 * Idempotent: writes the latest result, overwriting prior runs for that stage.
 */
export async function saveStageResult(
    instanceId: string,
    stageId: StageId,
    output: ExecuteStageOutput,
): Promise<void> {
    const [inst] = await db.select().from(instances).where(eq(instances.id, instanceId))
    if (!inst) throw new Error(`saveStageResult: instance ${instanceId} not found`)
    const rd = (inst.researchData as Record<string, unknown> | null) || {}
    const results = ((rd.results as Record<string, unknown>) || {}) as Record<StageId, StageResult>
    const plan = (rd.plan as { stages?: StageId[]; status?: Record<StageId, StageStatus> } | undefined) || {}
    const status: Record<StageId, StageStatus> = { ...(plan.status || {}) } as Record<StageId, StageStatus>

    const stageResult: StageResult = {
        content: output.content,
        source: output.source,
        runAt: output.status.runAt || new Date().toISOString(),
        integrationsUsed: output.integrationsUsed,
        ...(output.records ? { records: output.records } : {}),
        ...(output.dfsCost !== undefined ? { dfsCost: output.dfsCost } : {}),
        ...(output.confidence ? { confidence: output.confidence } : {}),
        ...(output.qualityGate ? { qualityGate: output.qualityGate } : {}),
        ...(output.extras ? { extras: output.extras } : {}),
    }

    results[stageId] = stageResult
    status[stageId] = output.status

    await db.update(instances).set({
        researchData: {
            ...rd,
            results,
            plan: { ...plan, status },
        } as never,
    }).where(eq(instances.id, instanceId))
}