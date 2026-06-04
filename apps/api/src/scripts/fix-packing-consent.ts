/** One-off FIX: replace the broken Consent Mode setup on a tenant's GTM container.
 * Our "Consent Default - Denied" + "Consent Update - On Accept" (which waits for a
 * `consent_update` dataLayer event the site's CMP never emits) means consent can
 * only ever be DENIED → client-side GA4 (whatsapp_click, attribution) is throttled.
 *
 * Fix: rewrite the Consent Default to region-scoped (GRANTED globally incl. IL,
 * DENIED only EEA+UK) so the IL market measures by default + EU stays GDPR-safe,
 * and DELETE the non-firing Consent Update tag. Publishes a new version.
 *   node --env-file=.env --import tsx src/scripts/fix-packing-consent.ts <agentId>
 */
import { db } from '@/db'
import { matehAgents } from '@/db/schema'
import { eq } from 'drizzle-orm'

const GTM = 'https://tagmanager.googleapis.com/tagmanager/v2'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const EEA_UK = ['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'IS', 'LI', 'NO', 'GB']

const NEW_DEFAULT_HTML = `<script>
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
// Global default: GRANTED (IL market measures by default). EEA+UK: DENIED until
// the site's CMP grants. region-specific defaults override the global one.
gtag('consent', 'default', {
  ad_storage: 'granted', ad_user_data: 'granted', ad_personalization: 'granted',
  analytics_storage: 'granted', functionality_storage: 'granted', security_storage: 'granted'
});
gtag('consent', 'default', {
  ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied',
  analytics_storage: 'denied', functionality_storage: 'granted', security_storage: 'granted',
  wait_for_update: 500,
  region: ${JSON.stringify(EEA_UK)}
});
</script>`

let token = ''
async function gtm(path: string, method = 'GET', body?: unknown): Promise<any> {
    const r = await fetch(`${GTM}${path}`, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
    const t = await r.text(); let d: any = {}; try { d = t ? JSON.parse(t) : {} } catch { d = { raw: t } }
    if (!r.ok) throw new Error(`GTM ${method} ${path} → ${r.status}: ${(d?.error?.message || t).slice(0, 200)}`)
    return d
}

async function main() {
    const [a] = await db.select().from(matehAgents).where(eq(matehAgents.id, process.argv[2] || 'mta_Un9jXRuf'))
    const t: any = (a?.researchData as any)?.mazhirGtm?.target || {}
    const rt = (a?.googleTokens as any)?.refreshToken || (a?.googleTokens as any)?.refresh_token
    const tr = await fetch(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID || '', client_secret: process.env.GOOGLE_CLIENT_SECRET || '', refresh_token: rt, grant_type: 'refresh_token' }) })
    token = ((await tr.json()) as any).access_token
    const base = `/accounts/${t.accountId}/containers/${t.containerId}`

    // Default Workspace + sync to live
    const wss = await gtm(`${base}/workspaces`)
    const ws = (wss.workspace || []).find((w: any) => /^default\s+workspace$/i.test(String(w.name || '')))
    if (!ws) throw new Error('no Default Workspace')
    const wsBase = `${base}/workspaces/${ws.workspaceId}`
    try { await gtm(`${wsBase}:sync`, 'POST', {}) } catch (e) { console.warn('sync warn:', (e as Error).message.slice(0, 120)) }

    const tags = (await gtm(`${wsBase}/tags`)).tag || []
    const def = tags.find((x: any) => /consent[\s_]*default/i.test(x.name) || x.name === 'Consent Default - Denied (Mazhir)')
    const upd = tags.find((x: any) => /consent[\s_]*update/i.test(x.name) || x.name === 'Consent Update - On Accept (Mazhir)')
    console.log(`found: default=${def?.name || 'NONE'} (id ${def?.tagId}) · update=${upd?.name || 'NONE'} (id ${upd?.tagId})`)

    if (def) {
        const params = (def.parameter || []).map((p: any) => p.key === 'html' ? { ...p, value: NEW_DEFAULT_HTML } : p)
        await gtm(`${wsBase}/tags/${def.tagId}`, 'PUT', { ...def, name: 'Consent Default - Region-scoped (Mazhir)', parameter: params })
        console.log('✓ updated Consent Default → region-scoped (granted global / denied EEA+UK)')
    }
    if (upd) {
        await gtm(`${wsBase}/tags/${upd.tagId}`, 'DELETE')
        console.log('✓ deleted broken Consent Update tag')
    }

    const ver = await gtm(`${wsBase}:create_version`, 'POST', { name: `Consent fix ${new Date().toISOString().slice(0, 10)}`, notes: 'Region-scoped consent default (granted IL / denied EEA+UK) + removed non-firing update.' })
    const vid = ver.containerVersion?.containerVersionId
    const compErr = ver.containerVersion?.compilerError
    if (!vid) { console.log('create_version no id', compErr ? `compilerError: ${JSON.stringify(compErr).slice(0, 200)}` : ''); process.exit(1) }
    await gtm(`${base}/versions/${vid}:publish`, 'POST')
    console.log(`✓ published version ${vid}`)
    process.exit(0)
}
main().catch(e => { console.error('FATAL', e); process.exit(1) })