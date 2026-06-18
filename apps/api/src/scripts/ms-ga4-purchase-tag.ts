/** MS — add a GA4 purchase event tag to our GTM container (WLZ3CX7B) so the
 *  companion's dataLayer `purchase` push reaches GA4 (G-JS48GDEL9H) with
 *  ecommerce value/items. No awct (the offline bridge owns Google Ads). Creates
 *  a customEvent `purchase` trigger + a gaawe tag, then publishes. Idempotent.
 *   node --env-file=.env --import tsx src/scripts/ms-ga4-purchase-tag.ts [--apply]
 */
import { db } from '@/db'
import { matehAgents } from '@/db/schema'
import { eq } from 'drizzle-orm'

const AGENT = 'mta_Xm8CfS3K', MID = 'G-JS48GDEL9H'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GTM = 'https://www.googleapis.com/tagmanager/v2'

async function at(rt: string) {
    const r = await fetch(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID || '', client_secret: process.env.GOOGLE_CLIENT_SECRET || '', refresh_token: rt, grant_type: 'refresh_token' }) })
    return ((await r.json()) as any).access_token
}
async function g(tok: string, path: string, method = 'GET', body?: any) {
    const r = await fetch(`${GTM}${path}`, { method, headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(`${method} ${path} → ${r.status}: ${JSON.stringify((d as any)?.error?.message || d).slice(0, 200)}`)
    return d as any
}

async function main() {
    const apply = process.argv.includes('--apply')
    const [agent] = await db.select().from(matehAgents).where(eq(matehAgents.id, AGENT))
    const t = (agent!.researchData as any)?.mazhirGtm?.target
    if (!t?.accountId || !t?.containerId) throw new Error('GTM target missing')
    const tok = await at((agent!.googleTokens as any).refreshToken)
    const cbase = `/accounts/${t.accountId}/containers/${t.containerId}`

    const wss = await g(tok, `${cbase}/workspaces`)
    const ws = (wss.workspace || []).find((w: any) => w.name === 'Default Workspace') || (wss.workspace || [])[0]
    const wsBase = `${cbase}/workspaces/${ws.workspaceId}`
    console.log(apply ? '⚙  APPLY\n' : '👀 DRY-RUN\n', 'container', t.publicId, 'ws', ws.workspaceId)

    const [tags, trigs] = await Promise.all([g(tok, `${wsBase}/tags`), g(tok, `${wsBase}/triggers`)])
    const haveTag = (tags.tag || []).find((x: any) => x.type === 'gaawe' && (x.parameter || []).some((p: any) => p.key === 'eventName' && p.value === 'purchase'))
    const haveTrig = (trigs.trigger || []).find((x: any) => x.type === 'customEvent' && JSON.stringify(x).includes('"purchase"'))
    console.log('existing purchase gaawe tag:', haveTag ? haveTag.name : 'none', '| trigger:', haveTrig ? haveTrig.name : 'none')
    if (haveTag) { console.log('✅ GA4 purchase tag already present — nothing to do'); process.exit(0) }
    if (!apply) { console.log('\nwould create: customEvent trigger `purchase` + gaawe tag → publish.'); process.exit(0) }

    // 1. trigger (reuse if present)
    let trigId = haveTrig?.triggerId
    if (!trigId) {
        const tr = await g(tok, `${wsBase}/triggers`, 'POST', {
            name: 'Mazhir CE — purchase', type: 'customEvent',
            customEventFilter: [{ type: 'equals', parameter: [{ type: 'template', key: 'arg0', value: '{{_event}}' }, { type: 'template', key: 'arg1', value: 'purchase' }] }],
        })
        trigId = tr.triggerId
        console.log('created trigger', trigId)
    }

    // 2. gaawe GA4 purchase tag — send ecommerce data from the dataLayer
    const tag = await g(tok, `${wsBase}/tags`, 'POST', {
        name: 'Mazhir GA4 — purchase', type: 'gaawe',
        parameter: [
            { type: 'template', key: 'eventName', value: 'purchase' },
            { type: 'template', key: 'measurementIdOverride', value: MID },
            { type: 'boolean', key: 'sendEcommerceData', value: 'true' },
            { type: 'template', key: 'ecommerceMacroData', value: 'dataLayer' },
        ],
        firingTriggerId: [trigId],
    })
    console.log('created gaawe tag', tag.tagId)

    // 3. version + publish
    const ver = await g(tok, `${wsBase}:create_version`, 'POST', { name: 'Mazhir — GA4 purchase tag' })
    const vid = ver.containerVersion?.containerVersionId || ver.compilerError ? ver.containerVersion?.containerVersionId : ver.containerVersion?.containerVersionId
    if (!vid) { console.log('version create response:', JSON.stringify(ver).slice(0, 300)); throw new Error('no version id') }
    await g(tok, `${cbase}/versions/${vid}:publish`, 'POST')
    console.log(`✅ published version ${vid} — GA4 purchase tag live`)
    process.exit(0)
}
main().catch(e => { console.error('FATAL', e); process.exit(1) })