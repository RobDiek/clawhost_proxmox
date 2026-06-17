/** Re-run research via FIRE-AND-POLL (the dashboard's pattern). Node's 300s
 *  requestTimeout kills long stages' HTTP connection while they keep running
 *  server-side → can't await synchronously. Instead: fire the stage POST
 *  (connection may drop — fine), then POLL the /status endpoint until the
 *  stage's plan.status[stageId] reaches a terminal state with a NEW runAt.
 *  Sequential → the per-instance lock is free before the next stage. */
import { db } from '@/db'
import { instances, matehAgents } from '@/db/schema'
import { eq } from 'drizzle-orm'
import crypto from 'crypto'
import { STAGE_CATALOG, ALL_STAGE_IDS } from '@/services/research/types'

function mintJwt(sub: string): string {
    const secret = process.env.JWT_SECRET || ''
    const h = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
    const p = Buffer.from(JSON.stringify({ sub, exp: Math.floor(Date.now() / 1000) + 8 * 3600 })).toString('base64url')
    return `${h}.${p}.${crypto.createHmac('sha256', secret).update(`${h}.${p}`).digest('base64url')}`
}
function topoOrder(stages: string[]): string[] {
    const set = new Set(stages); const done = new Set<string>(); const order: string[] = []
    let g = 0
    while (order.length < stages.length && g++ < 200) for (const s of stages) {
        if (done.has(s)) continue
        const ups = ((STAGE_CATALOG as any)[s]?.upstream || []).filter((u: string) => set.has(u))
        if (ups.every((u: string) => done.has(u))) { order.push(s); done.add(s) }
    }
    for (const s of stages) if (!done.has(s)) order.push(s)
    return order
}
const TERMINAL = new Set(['completed', 'degraded', 'failed', 'skipped'])
const needsInput = (m: string) => /לבחור|no_history|has_history|questionnaire|להעלות|csv/i.test(m)
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

async function main() {
    const instanceId = process.argv[2] || '44f484a852'
    const agentId = process.argv[3] || 'mta_Un9jXRuf'
    const base = 'http://localhost:' + (process.env.PORT || '3001')
    const [inst] = await db.select().from(instances).where(eq(instances.id, instanceId)) as any[]
    const [agent] = await db.select().from(matehAgents).where(eq(matehAgents.id, agentId)) as any[]
    const order = topoOrder(Object.keys((agent.researchData || {}).results || {}).filter(k => (ALL_STAGE_IDS as readonly string[]).includes(k)))
    const token = mintJwt(inst.userId)
    const hdr = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }
    const stageUrl = (s: string) => `${base}/hosting/instances/${instanceId}/research/stage/${s}?agentId=${agentId}`
    const statusOf = async (s: string) => {
        try { const j: any = await (await fetch(stageUrl(s).replace('?', '/status?'), { headers: hdr })).json(); return j?.data?.status || { state: 'pending' } }
        catch { return { state: 'unknown' } }
    }
    console.log(`API=${base} owner=${inst.userId} stages=${order.length}`)
    console.log('order:', order.join(' → '))

    let ok = 0, skipped = 0, failed = 0
    for (const stage of order) {
        const t0 = Date.now()
        const prevRunAt = (await statusOf(stage)).runAt
        // fire POST (connection may drop at 300s — expected for long stages)
        let postNote = ''
        try {
            const r = await fetch(stageUrl(stage), { method: 'POST', headers: hdr, body: '{}', signal: AbortSignal.timeout(310000) })
            const j: any = await r.json().catch(() => ({})); postNote = j?.message || (r.ok ? 'ok' : 'http ' + r.status)
            if (!r.ok && needsInput(postNote)) {
                const r2 = await fetch(stageUrl(stage), { method: 'POST', headers: hdr, body: JSON.stringify({ fork: 'has_history', mode: 'has_history', choice: 'has_history' }), signal: AbortSignal.timeout(310000) })
                const j2: any = await r2.json().catch(() => ({})); postNote = j2?.message || (r2.ok ? 'ok' : 'http ' + r2.status)
            }
        } catch (e: any) { postNote = 'conn-drop(' + (e?.message || '') + ')' }

        if (needsInput(postNote)) { skipped++; console.log(`[SKIP-input] ${stage} — ${postNote.slice(0, 80)}`); continue }

        // poll until a NEW terminal run is recorded (or timeout ~26min)
        const deadline = Date.now() + 26 * 60 * 1000
        let seenNew = false, finalState = ''
        while (Date.now() < deadline) {
            await sleep(15000)
            const st = await statusOf(stage)
            if (st.runAt && st.runAt !== prevRunAt) seenNew = true
            if (seenNew && TERMINAL.has(st.state)) { finalState = st.state; break }
            if (!seenNew && Date.now() - t0 > 90000) { finalState = 'no-new-run'; break }   // stage never started (skipped/blocked)
        }
        const secs = Math.round((Date.now() - t0) / 1000)
        if (finalState === 'completed' || finalState === 'degraded') { ok++; console.log(`[OK ${secs}s] ${stage} — ${finalState}`) }
        else if (finalState === 'no-new-run') { skipped++; console.log(`[SKIP ${secs}s] ${stage} — did not start (${postNote.slice(0, 60)})`) }
        else { failed++; console.log(`[XX ${secs}s] ${stage} — ${finalState || 'poll-timeout'} (post: ${postNote.slice(0, 50)})`) }
    }
    console.log(`\n===== RESEARCH RE-RUN DONE: ok=${ok} skipped=${skipped} failed=${failed} / ${order.length} =====`)
    process.exit(0)
}
main().catch(e => { console.error('FATAL', e?.message || e); process.exit(1) })