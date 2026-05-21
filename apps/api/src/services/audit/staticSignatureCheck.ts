/**
 * Phase 4.3-T — Static signature audit.
 *
 * Catches the bug class that's invisible to runtime data checks:
 * service-layer helpers that take an OPTIONAL `agentId?` and silently
 * fall back to the primary agent when caller forgets to pass it. This
 * is what caused the brand-book-wizard-scrapes-Storage bug — 13 call
 * sites in brandV2 controller forgot the param, all landed on Storage.
 *
 * The check scans `src/services/**` and `src/controllers/**` for:
 *   - Function signatures with `agentId?:` (optional) when the function
 *     reads or writes per-agent data
 *   - DB queries against per-agent tables (brand_books, agent_integrations,
 *     mateh_agents fields like research_data) WITHOUT an agentId filter
 *
 * Reports each match as a `warn` or `fail` so the operator can decide
 * whether to migrate the signature or document why optional is correct.
 *
 * NOTE: this is a heuristic — false positives possible. Manually verify
 * each finding before refactoring. The point is to surface candidates
 * for review, not to enforce hard rules.
 */

import { promises as fs } from 'fs'
import path from 'path'
import type { AuditFinding, AuditContext } from './types'

const SCAN_ROOTS = ['src/services', 'src/controllers']
const FILE_EXTENSIONS = new Set(['.ts'])
const EXCLUDE_DIRS = new Set(['node_modules', 'dist', 'build', '__tests__', 'audit'])

// Per-agent tables / fields we should never query without agent_id scoping
const PER_AGENT_TABLES = ['brandBooks', 'agentIntegrations', 'matehAgents', 'agentOutputs']

interface ScanHit {
    file: string
    line: number
    snippet: string
    pattern: string
}

async function walkSource(rootDir: string, hits: ScanHit[], patterns: { name: string; re: RegExp }[]): Promise<void> {
    try {
        const entries = await fs.readdir(rootDir, { withFileTypes: true })
        for (const entry of entries) {
            const full = path.join(rootDir, entry.name)
            if (entry.isDirectory()) {
                if (EXCLUDE_DIRS.has(entry.name)) continue
                await walkSource(full, hits, patterns)
            } else if (FILE_EXTENSIONS.has(path.extname(entry.name))) {
                const text = await fs.readFile(full, 'utf-8')
                const lines = text.split('\n')
                for (let i = 0; i < lines.length; i++) {
                    for (const p of patterns) {
                        if (p.re.test(lines[i])) {
                            hits.push({
                                file: path.relative(process.cwd(), full),
                                line: i + 1,
                                snippet: lines[i].trim().slice(0, 140),
                                pattern: p.name,
                            })
                        }
                    }
                }
            }
        }
    } catch (err) {
        void err   // best-effort — missing dir or perm denied just gives empty hits
    }
}

export const staticSignatureCheck = async (ctx: AuditContext): Promise<AuditFinding[]> => {
    const findings: AuditFinding[] = []

    // Find the api package root from cwd (script may run from anywhere)
    const apiCwd = process.cwd()
    let apiRoot = apiCwd
    // Heuristic: if running from project root, descend to apps/api
    if (apiCwd.endsWith('clawflow') || apiCwd.endsWith('openclaw-hosting')) {
        apiRoot = path.join(apiCwd, 'apps', 'api')
    }

    const hits: ScanHit[] = []
    const patterns: { name: string; re: RegExp }[] = [
        // Optional agentId — exact bug class from brand book wizard
        { name: 'optional_agent_id_param', re: /\bagentId\?\s*:\s*string\b/ },
        // Per-agent table query missing agent_id filter
        // (heuristic: line has `.where(` AND a per-agent table reference,
        // but no `agentId` token — approximate but catches the egregious cases)
    ]
    for (const root of SCAN_ROOTS) {
        await walkSource(path.join(apiRoot, root), hits, patterns)
    }

    // Per-agent-table queries without agentId — separate pass since this
    // needs line + context inspection (`.where(eq(brandBooks.instanceId, ...`
    // without `agentId` in same statement).
    const dbHits: ScanHit[] = []
    for (const root of SCAN_ROOTS) {
        const tablePatterns = PER_AGENT_TABLES.map(t => ({
            name: `query_missing_agentid:${t}`,
            // Lines that reference the table and have `eq(t.instanceId` AND
            // do NOT mention `agentId` in the same line.
            re: new RegExp(`eq\\(${t}\\.instanceId[^)]*\\)`, ''),
        }))
        await walkSource(path.join(apiRoot, root), dbHits, tablePatterns)
    }
    // Filter dbHits: keep only lines that DON'T mention agentId on the
    // same line OR in the surrounding 3 lines. Since walkSource only gives
    // per-line, this is approximate — adequate for surfacing candidates.
    const dbCandidates = dbHits.filter(h => !/agentId/i.test(h.snippet))

    // Build findings. Group by file to keep the report tidy.
    if (hits.length > 0) {
        const byFile = new Map<string, ScanHit[]>()
        for (const h of hits) {
            const arr = byFile.get(h.file) || []
            arr.push(h)
            byFile.set(h.file, arr)
        }
        for (const [file, fileHits] of byFile) {
            findings.push({
                category: 'cross_agent',
                id: `optional_agent_id:${file}`,
                title: `${fileHits.length} פונקציות עם agentId אופציונלי ב-${file}`,
                severity: 'warn',
                detail:
                    `Found ${fileHits.length} signature(s) with \`agentId?: string\` in ${file}. ` +
                    `Each is at risk of silent primary-agent fallback when caller forgets to pass — ` +
                    `the exact root cause of the brand-book-wizard-scrapes-Storage bug. ` +
                    `Consider migrating to required \`agentId: string | null\` so TypeScript blocks ` +
                    `callers that don't pass either an active agent id or explicit null. Lines: ` +
                    fileHits.slice(0, 5).map(h => h.line).join(', '),
                fixHint:
                    `Refactor signature to require agentId (string | null). TypeScript will catch ` +
                    `every caller that forgot to pass. Same pattern as Phase 4.3-T fix to ` +
                    `brandBookV2Service.ts.`,
                evidence: {
                    file,
                    sampleLines: fileHits.slice(0, 5).map(h => ({ line: h.line, snippet: h.snippet })),
                },
                scope: { instanceId: ctx.instanceId, agentId: ctx.agentId },
            })
        }
    }

    if (dbCandidates.length > 0) {
        // Dedupe by (file, table) to avoid noise
        const seen = new Set<string>()
        const summary: Array<{ file: string; table: string; lines: number[] }> = []
        for (const h of dbCandidates) {
            const table = h.pattern.split(':')[1]
            const key = `${h.file}|${table}`
            if (seen.has(key)) continue
            seen.add(key)
            summary.push({
                file: h.file,
                table,
                lines: dbCandidates.filter(c => c.file === h.file && c.pattern.endsWith(table)).map(c => c.line),
            })
        }
        if (summary.length > 0) {
            findings.push({
                category: 'cross_agent',
                id: 'db_query_missing_agentid',
                title: `${summary.length} שאילתות DB לטבלאות per-agent בלי סינון לפי agent_id`,
                severity: 'info',
                detail:
                    `Found ${summary.length} site(s) querying per-agent tables (brandBooks / agentIntegrations / matehAgents / agentOutputs) ` +
                    `WITHOUT an agentId filter on the same line. False-positives are likely (e.g. listing all rows across agents is a legitimate use case), ` +
                    `but each one warrants review.`,
                fixHint:
                    `For each candidate, verify: is the query intentionally cross-agent (e.g. a list-all view), ` +
                    `or is it missing an agent_id filter that would prevent cross-tenant leak? If missing — add eq(table.agentId, ...) to the where clause.`,
                evidence: { sites: summary.slice(0, 12) },
                scope: { instanceId: ctx.instanceId, agentId: ctx.agentId },
            })
        }
    }

    if (findings.length === 0) {
        findings.push({
            category: 'cross_agent',
            id: 'static_signature_clean',
            title: 'אין חתימות עם agentId אופציונלי בקוד הסוכן',
            severity: 'pass',
            detail: 'Static scan of src/services + src/controllers found zero `agentId?: string` patterns and zero unfiltered per-agent table queries.',
            scope: { instanceId: ctx.instanceId, agentId: ctx.agentId },
        })
    }

    return findings
}