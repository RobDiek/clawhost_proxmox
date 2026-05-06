/**
 * Audit Diff — compare current audit to the previous one.
 *
 * When user re-runs audit, surface what CHANGED:
 *   - methodology shift (STAG → STAG+PMax)
 *   - blockers added/removed
 *   - tracking score moved
 *   - estimated conversions ±20%+
 *   - new sources became available
 *
 * Persisted in researchData.mazhirAuditDiff and rendered in audit modal.
 * Goal: user gets a sense of MOVEMENT, not just a wall of fresh JSON.
 */

import type { MazhirAudit } from '@/controllers/hosting/agentSetup'

export interface AuditDiff {
    diffedAt: string
    fromGeneratedAt: string
    toGeneratedAt: string
    summary: string
    changes: Array<{
        category: 'methodology' | 'blockers' | 'tracking' | 'projection' | 'sources' | 'recommendations'
        kind: 'added' | 'removed' | 'changed'
        description: string                 // plain Hebrew
    }>
}

export function computeAuditDiff(prev: MazhirAudit, curr: MazhirAudit): AuditDiff {
    const changes: AuditDiff['changes'] = []

    // Methodology
    if (prev.methodology !== curr.methodology) {
        changes.push({
            category: 'methodology',
            kind: 'changed',
            description: `מתודולוגיה השתנתה: ${prev.methodology} → ${curr.methodology}`,
        })
    }

    // Blockers added/removed
    const prevBlockers = new Set(prev.blockers || [])
    const currBlockers = new Set(curr.blockers || [])
    for (const b of currBlockers) {
        if (!prevBlockers.has(b)) changes.push({ category: 'blockers', kind: 'added', description: 'נוסף חוסם: ' + b })
    }
    for (const b of prevBlockers) {
        if (!currBlockers.has(b)) changes.push({ category: 'blockers', kind: 'removed', description: 'הוסר חוסם: ' + b })
    }

    // Tracking score
    if (prev.trackingHealth?.score !== curr.trackingHealth?.score) {
        changes.push({
            category: 'tracking',
            kind: 'changed',
            description: `ציון תשתית מעקב: ${prev.trackingHealth?.score} → ${curr.trackingHealth?.score}`,
        })
    }

    // Projection delta > 20%
    const prevExp = prev.estimatedMonthlyConversions?.expected || 0
    const currExp = curr.estimatedMonthlyConversions?.expected || 0
    if (prevExp > 0 && Math.abs(currExp - prevExp) / prevExp > 0.2) {
        const dir = currExp > prevExp ? 'עלה' : 'ירד'
        const pct = Math.abs(Math.round(((currExp - prevExp) / prevExp) * 100))
        changes.push({
            category: 'projection',
            kind: 'changed',
            description: `המרות צפויות/חודש: ${prev.estimatedMonthlyConversions?.expected} → ${curr.estimatedMonthlyConversions?.expected} (${dir} ב-${pct}%)`,
        })
    }

    // Source coverage diff
    const prevCov: any = (prev as any).sourceCoverage || {}
    const currCov: any = (curr as any).sourceCoverage || {}
    for (const k of new Set([...Object.keys(prevCov), ...Object.keys(currCov)])) {
        const before = prevCov[k]?.status
        const after = currCov[k]?.status
        if (before !== after) {
            if (before !== 'ok' && after === 'ok') {
                changes.push({ category: 'sources', kind: 'added', description: `מקור נתונים חדש זמין: ${k}` })
            } else if (before === 'ok' && after !== 'ok') {
                changes.push({ category: 'sources', kind: 'removed', description: `מקור נתונים נעלם: ${k} (${currCov[k]?.reason || ''})` })
            }
        }
    }

    let summary = ''
    if (changes.length === 0) {
        summary = 'אין שינויים מהותיים מהאודיט הקודם.'
    } else {
        const blockerDelta = changes.filter(c => c.category === 'blockers').length
        const sourceDelta = changes.filter(c => c.category === 'sources').length
        const parts: string[] = []
        if (blockerDelta) parts.push(`${blockerDelta} שינויי חוסמים`)
        if (sourceDelta) parts.push(`${sourceDelta} שינויי מקורות`)
        if (changes.some(c => c.category === 'methodology')) parts.push('מתודולוגיה התעדכנה')
        if (changes.some(c => c.category === 'projection')) parts.push('תחזית עודכנה')
        summary = parts.join(' · ') || `${changes.length} שינויים`
    }

    return {
        diffedAt: new Date().toISOString(),
        fromGeneratedAt: prev.generatedAt,
        toGeneratedAt: curr.generatedAt,
        summary,
        changes,
    }
}