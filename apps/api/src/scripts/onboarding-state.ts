/**
 * READ-ONLY onboarding scoreboard for one agent.
 *
 * Reports pass/fail for EVERY onboarding step, from the authoritative data
 * (mateh_agents columns + agent_integrations + gbp_config + research_data) AND
 * the believed connection flags (research_data.integrationsState). Where the two
 * disagree it flags a ⚠ mismatch — that's the bug class we keep hitting
 * (saveGoogleAdsConfig DB-sync gap, dual-write wipes, stale flags).
 *
 * Usage (on the box):
 *   node --env-file=.env --import tsx src/scripts/onboarding-state.ts [agentId]
 *   default agentId = mta_Xm8CfS3K (Moving Station)
 *
 * Pure reads. No writes, no external IO beyond the DB.
 */
import { db } from '@/db'
import { matehAgents, agentIntegrations, gbpConfig, instances } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { ALL_STAGE_IDS } from '@/services/research/types'

type Mark = 'pass' | 'fail' | 'warn' | 'info'
const ICON: Record<Mark, string> = { pass: '✅', fail: '❌', warn: '⚠️ ', info: 'ℹ️ ' }

function nonEmpty(v: unknown): boolean {
    if (v == null) return false
    if (typeof v === 'string') return v.trim().length > 0
    if (Array.isArray(v)) return v.length > 0
    if (typeof v === 'object') return Object.keys(v as object).length > 0
    return !!v
}

async function main() {
    const agentId = process.argv[2] || 'mta_Xm8CfS3K'
    const [agent] = (await db.select().from(matehAgents).where(eq(matehAgents.id, agentId))) as any[]
    if (!agent) { console.log(`agent ${agentId} not found`); process.exit(1) }
    const instanceId = agent.vpsInstanceId
    const rd: any = agent.researchData || {}
    const ints = (await db.select().from(agentIntegrations).where(eq(agentIntegrations.instanceId, instanceId))) as any[]
    const myInts = ints.filter(r => r.agentId === agentId)
    const [gbp] = (await db.select().from(gbpConfig).where(eq(gbpConfig.instanceId, instanceId))) as any[]
    // DataForSEO lives at the INSTANCE level (shared by all agents on the VPS).
    const [inst] = (await db.select().from(instances).where(eq(instances.id, instanceId))) as any[]
    const istate: Record<string, any> = (rd.integrationsState || {})
    const gtok: any = agent.googleTokens || {}
    const scopes: string[] = Array.isArray(gtok.scopes) ? gtok.scopes : []
    // googleTokens.scopes stores ALIAS keys (ads/gtm/analytics/gsc), not URLs.
    // Match the alias OR the underlying URL fragment, to be storage-robust.
    const SCOPE_URL: Record<string, string> = { ads: 'adwords', gtm: 'tagmanager', analytics: 'analytics', gsc: 'webmasters' }
    const hasScope = (alias: string) => scopes.some(s => { const v = String(s); return v === alias || v.includes(SCOPE_URL[alias] || alias) })
    const adsCfg: any = agent.googleAdsConfig || {}
    const ghCfg: any = agent.githubConfig || {}
    const wp = (myInts.find(r => r.integrationType === 'wordpress')?.config || {}) as any

    const rows: Array<{ group: string; step: string; mark: Mark; detail: string; believed?: string }> = []
    const add = (group: string, step: string, mark: Mark, detail: string, believedId?: string) => {
        let believed: string | undefined
        if (believedId) {
            const b = istate[believedId]
            believed = b ? (b.connected ? 'state:connected' : 'state:not-connected') : 'state:absent'
            // mismatch: data present but state says not connected (or vice-versa)
            const dataOk = mark === 'pass'
            const stateOk = !!b?.connected
            if (dataOk !== stateOk && mark !== 'info') believed += ' ⚠MISMATCH'
        }
        rows.push({ group, step, mark, detail, believed })
    }

    // ── Lesson 03 — brain / voice / data ──
    add('03 מוח/קול/נתונים', 'Claude / AI key', nonEmpty(agent.aiProviderKey) ? 'pass' : (nonEmpty(agent.openaiApiKey) ? 'pass' : 'fail'),
        `aiProviderType=${agent.aiProviderType || '-'} aiKey=${nonEmpty(agent.aiProviderKey) ? 'set' : '-'} openai=${nonEmpty(agent.openaiApiKey) ? 'set' : '-'}`)
    add('03 מוח/קול/נתונים', 'Telegram bot', (nonEmpty(agent.telegramBotToken) && nonEmpty(agent.telegramChatId)) ? 'pass' : (nonEmpty(agent.telegramBotToken) ? 'warn' : 'fail'),
        `botToken=${nonEmpty(agent.telegramBotToken) ? 'set' : '-'} chatId=${nonEmpty(agent.telegramChatId) ? 'set' : '-'}`)
    const dfsOk = inst?.dfsUseProxy ? ((inst.dfsBalanceUsdCents || 0) > 0) : nonEmpty(inst?.dataforseoKey)
    add('03 מוח/קול/נתונים', 'DataForSEO data', dfsOk ? 'pass' : 'fail',
        `[instance] mode=${inst?.dfsUseProxy ? 'managed-proxy' : 'own-key'} balance=$${((inst?.dfsBalanceUsdCents || 0) / 100).toFixed(2)} ownKey=${nonEmpty(inst?.dataforseoKey) ? 'set' : '-'}`)

    // ── Lesson 04 — channels: website ──
    add('04 ערוצים · אתר', 'Website URL', nonEmpty(rd.answers?.websiteUrl) ? 'pass' : 'fail', `url=${rd.answers?.websiteUrl || '-'}`)
    const wpOk = nonEmpty(wp.url) && nonEmpty(wp.appPassword)
    const ghOk = nonEmpty(ghCfg.token) && nonEmpty(ghCfg.repo)
    add('04 ערוצים · אתר', 'WordPress', wpOk ? 'pass' : 'fail', `url=${wp.url || '-'} appPw=${nonEmpty(wp.appPassword) ? 'set' : '-'}`, 'wordpress')
    add('04 ערוצים · אתר', 'GitHub (non-WP)', ghOk ? 'pass' : 'fail', `repo=${ghCfg.repo || '-'} token=${nonEmpty(ghCfg.token) ? 'set' : '-'}`, 'github')
    add('04 ערוצים · אתר', '→ publish target (WP OR GitHub)', (wpOk || ghOk) ? 'pass' : 'fail', wpOk ? 'via WordPress' : ghOk ? 'via GitHub' : 'neither connected')

    // ── Lesson 04 — channels: Google ──
    add('04 ערוצים · Google', 'Google OAuth', nonEmpty(gtok.email) ? 'pass' : 'fail', `email=${gtok.email || '-'} scopes=[${scopes.map(s => String(s).split('/').pop()).join(',') || '-'}]`)
    add('04 ערוצים · Google', 'Google Ads', (hasScope('ads') && nonEmpty(adsCfg.customerId) && nonEmpty(adsCfg.developerToken)) ? 'pass' : 'fail',
        `scope=${hasScope('ads') ? 'y' : 'n'} customerId=${adsCfg.customerId || '-'} devToken=${nonEmpty(adsCfg.developerToken) ? 'set' : '-'}`, 'google_ads')
    add('04 ערוצים · Google', 'GA4', hasScope('analytics') ? 'pass' : 'fail',
        `scope=${hasScope('analytics') ? 'y' : 'n'} property=${gtok.ga4PropertyId || '(not picked)'}`, 'ga4')
    add('04 ערוצים · Google', 'GTM', hasScope('gtm') ? 'pass' : 'fail',
        `scope=${hasScope('gtm') ? 'y' : 'n'} container=${gtok.gtmContainerId || '(not picked)'}`, 'gtm')
    add('04 ערוצים · Google', 'Search Console', (nonEmpty(agent.gscTokens) || hasScope('gsc')) ? 'pass' : 'fail',
        `gscTokens=${nonEmpty(agent.gscTokens) ? 'set' : '-'} scope=${hasScope('gsc') ? 'y' : 'n'}`, 'gsc')
    add('04 ערוצים · Google', 'Google Business Profile', nonEmpty(gbp?.locationId) ? 'pass' : 'fail', `location=${gbp?.locationId || '-'} (instance-level)`, 'gbp')

    // ── Lesson 04 — channels: social (Meta OAuth deferred → informational) ──
    add('04 ערוצים · רשתות', 'Meta (FB/IG)', nonEmpty(agent.metaTokens) ? 'pass' : 'info', `metaTokens=${nonEmpty(agent.metaTokens) ? 'set' : '- (deferred → manual posting)'}`, 'meta_ads')

    // ── Research + strategy + plans ──
    const stageKeys = Object.keys(rd.results || {}).filter(k => (ALL_STAGE_IDS as readonly string[]).includes(k))
    add('מחקר ותכנון', 'Research stages', stageKeys.length >= ALL_STAGE_IDS.length ? 'pass' : (stageKeys.length > 0 ? 'warn' : 'fail'), `${stageKeys.length}/${ALL_STAGE_IDS.length} stages`)
    add('מחקר ותכנון', 'Strategy scenario', nonEmpty(rd.chosenScenario) ? 'pass' : 'fail', `scenario=${rd.chosenScenario?.scenario || '-'}`)
    add('מחקר ותכנון', 'Content plan', (rd.contentPlan?.items?.length || (Array.isArray(rd.contentPlan) ? rd.contentPlan.length : 0)) > 0 ? 'pass' : 'fail', `items=${rd.contentPlan?.items?.length ?? (Array.isArray(rd.contentPlan) ? rd.contentPlan.length : 0)}`)
    add('מחקר ותכנון', 'Media plan', nonEmpty(rd.mediaPlan) ? 'pass' : 'fail', `status=${rd.mediaPlan?.status || '-'}`)
    add('מחקר ותכנון', 'Monthly plan', (rd.monthlyPlan?.tasks?.length || 0) > 0 ? 'pass' : 'fail', `tasks=${rd.monthlyPlan?.tasks?.length || 0}`)

    // ── Render ──
    console.log(`\n═══ ONBOARDING STATE · ${agentId} (${agent.brandSlug}) · vps=${instanceId} ═══`)
    let curGroup = ''
    let pass = 0, fail = 0, warn = 0
    for (const r of rows) {
        if (r.group !== curGroup) { console.log(`\n  ▸ ${r.group}`); curGroup = r.group }
        if (r.mark === 'pass') pass++; else if (r.mark === 'fail') fail++; else if (r.mark === 'warn') warn++
        console.log(`    ${ICON[r.mark]} ${r.step.padEnd(34)} ${r.detail}${r.believed ? '  ·  ' + r.believed : ''}`)
    }
    console.log(`\n  ─── ${pass} pass · ${fail} fail · ${warn} warn ───\n`)
    process.exit(0)
}
main().catch(e => { console.error('FATAL', e?.message || e); process.exit(1) })