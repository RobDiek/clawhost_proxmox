/**
 * Site Widget — floating WhatsApp/call button + exit-intent popup.
 *
 * WordPress: POST a merged config to the companion plugin (v1.11.0+) which
 * renders the widgets in wp_footer. GitHub static sites: inject a self-contained
 * widget <script> into a detected layout file (before </body>) via a PR.
 *
 * The wa.me / tel: links are picked up by the GTM Click-to-Contact capture →
 * GA4 events → Ads secondary conversions, closing the loop.
 *
 * Widget kinds (a task selects one; configs MERGE so multiple tasks accumulate):
 *   - 'buttons'  → floating WhatsApp + click-to-call
 *   - 'popup'    → exit-intent popup (offer / WhatsApp CTA)
 */
import { loadWpConfig } from '@/services/seoMetaBatch'
import { loadGithubConfig } from '@/services/seoGithubBatch'

export type WidgetMode = 'buttons' | 'popup'
export interface SiteWidgetResult {
    ok: boolean
    integrationMissing: boolean
    needsPhone: boolean
    platform: 'wordpress' | 'github' | null
    applied: string[]
    prUrl?: string
    error?: string
}

interface WpCfg { url: string; user: string; appPassword: string }
const norm = (u: string) => u.replace(/\/+$/, '')
const auth = (c: WpCfg) => 'Basic ' + Buffer.from(`${c.user}:${c.appPassword}`).toString('base64')

function resolvePhone(rd: any): { whatsapp?: string; call?: string } {
    const a = rd?.answers || {}
    const p = rd?.paidProfile || {}
    // Canonical source for IL businesses: the verified Google Business Profile
    // phone captured in the audience_personas DFS data. Onboarding answers have
    // no phone field, so this is usually the only number we have.
    const gmb = rd?.results?.audience_personas?.dfsData?.ourGmb?.phone
    const wa = a.whatsapp || a.whatsappNumber || a.whatsapp_number || a.phone || a.telephone || a.businessPhone || p.phone || p.whatsapp || gmb
    const call = a.phone || a.telephone || a.businessPhone || p.phone || gmb || wa
    return { whatsapp: wa ? String(wa) : undefined, call: call ? String(call) : undefined }
}

function buildPopup(rd: any, taskText: string, waPhone?: string): any {
    const m = taskText.match(/(\d{1,2})\s*%/)
    const pct = m ? m[1] : ''
    const waHref = waPhone ? `https://wa.me/${waPhone.replace(/[^0-9]/g, '')}` : '#'
    return {
        enabled: true,
        headline: 'רגע לפני שאתם הולכים!',
        body: pct ? `קבלו ${pct}% הנחה על ההזמנה הראשונה — או דברו אתנו עכשיו בוואטסאפ ונעזור לבחור.` : 'יש לכם שאלה לפני שמזמינים? דברו אתנו עכשיו בוואטסאפ ונעזור לבחור את הכמות הנכונה.',
        couponCode: pct ? `SAVE${pct}` : '',
        ctaText: 'דברו אתנו בוואטסאפ',
        ctaHref: waHref,
    }
}

/** Self-contained JS that renders the same buttons + popup on a static site. */
function buildGithubWidgetJs(config: any): string {
    return `/* Flowmatic Site Widgets */
(function(){try{
  var C=${JSON.stringify(config)};
  var d=document;
  if((C.whatsapp&&C.whatsapp.enabled)||(C.call&&C.call.enabled)){
    var fab=d.createElement('div');fab.style.cssText='position:fixed;bottom:18px;left:18px;z-index:99998;display:flex;flex-direction:column;gap:10px';
    if(C.whatsapp&&C.whatsapp.enabled){var p=(C.whatsapp.phone||'').replace(/[^0-9]/g,'');var msg=C.whatsapp.message?('?text='+encodeURIComponent(C.whatsapp.message)):'';var a=d.createElement('a');a.href='https://wa.me/'+p+msg;a.target='_blank';a.rel='noopener';a.setAttribute('aria-label','WhatsApp');a.style.cssText='width:56px;height:56px;border-radius:50%;background:#25D366;display:flex;align-items:center;justify-content:center;box-shadow:0 3px 12px rgba(0,0,0,.25)';a.innerHTML='<svg width="30" height="30" viewBox="0 0 24 24" fill="#fff"><path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.16-.17.2-.35.22-.64.07-.3-.15-1.26-.46-2.39-1.47-.88-.79-1.48-1.76-1.65-2.06-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.61-.92-2.21-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.21 3.07c.15.2 2.1 3.2 5.08 4.49 2.99 1.29 2.99.86 3.53.81.54-.05 1.76-.72 2.01-1.41.25-.7.25-1.29.17-1.41-.07-.13-.27-.2-.57-.35"/></svg>';fab.appendChild(a);}
    if(C.call&&C.call.enabled){var c=d.createElement('a');c.href='tel:'+(C.call.phone||'');c.setAttribute('aria-label','Call');c.style.cssText='width:56px;height:56px;border-radius:50%;background:#2563EB;display:flex;align-items:center;justify-content:center;box-shadow:0 3px 12px rgba(0,0,0,.25)';c.innerHTML='<svg width="26" height="26" viewBox="0 0 24 24" fill="#fff"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/></svg>';fab.appendChild(c);}
    d.body.appendChild(fab);
  }
  if(C.exitPopup&&C.exitPopup.enabled){var P=C.exitPopup;var seen=function(){try{return sessionStorage.getItem('cf_exit_seen')}catch(e){return 1}};
    var m=d.createElement('div');m.style.cssText='display:none;position:fixed;inset:0;z-index:99999;background:rgba(15,23,42,.6);align-items:center;justify-content:center';
    m.innerHTML='<div style="background:#fff;max-width:420px;width:90%;border-radius:14px;padding:28px;text-align:center;direction:rtl;font-family:Arial,sans-serif;position:relative"><button id="cfx" aria-label="close" style="position:absolute;top:10px;left:14px;border:0;background:0;font-size:22px;cursor:pointer;color:#94A3B8">&times;</button><h3 style="margin:0 0 10px;font-size:1.35rem;color:#0F172A"></h3><p style="margin:0 0 16px;color:#475569;line-height:1.5"></p>'+(P.couponCode?'<div style="font-size:1.2rem;font-weight:800;letter-spacing:1px;background:#F1F5F9;border:1px dashed #2563EB;border-radius:8px;padding:10px;margin-bottom:16px;color:#1D4ED8"></div>':'')+'<a style="display:inline-block;background:#2563EB;color:#fff;text-decoration:none;font-weight:700;padding:11px 26px;border-radius:8px"></a></div>';
    m.querySelector('h3').textContent=P.headline||'';m.querySelector('p').textContent=P.body||'';var cpEl=m.querySelector('div[style*="dashed"]');if(cpEl)cpEl.textContent=P.couponCode||'';var aEl=m.querySelector('a');aEl.textContent=P.ctaText||'';aEl.href=P.ctaHref||'#';
    d.body.appendChild(m);
    function show(){if(seen())return;try{sessionStorage.setItem('cf_exit_seen','1')}catch(e){}m.style.display='flex';}function hide(){m.style.display='none';}
    d.addEventListener('mouseout',function(e){if(e.clientY<=0&&!e.relatedTarget)show();});setTimeout(show,45000);
    m.querySelector('#cfx').addEventListener('click',hide);m.addEventListener('click',function(e){if(e.target===m)hide();});
  }
}catch(e){}})();`
}

// Minimal GitHub helpers (PR-only writes; mirrors seoGithubBatch safety rules).
async function ghFetch(token: string, path: string, init: RequestInit = {}): Promise<Response> {
    return fetch(`https://api.github.com${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', 'User-Agent': 'FlowmaticBot', ...(init.headers || {}) }, signal: AbortSignal.timeout(30000) })
}
const LAYOUT_CANDIDATES = ['_layouts/default.html', 'layouts/_default/baseof.html', '_includes/footer.html', 'src/layouts/Layout.astro', 'index.html', 'public/index.html', 'dist/index.html']

async function applyGithub(cfg: { token: string; repo: string; branch: string }, js: string): Promise<{ prUrl?: string; applied: string[]; error?: string }> {
    const applied: string[] = []
    try {
        const refRes = await ghFetch(cfg.token, `/repos/${cfg.repo}/git/ref/heads/${encodeURIComponent(cfg.branch)}`)
        if (!refRes.ok) return { applied, error: `ref ${refRes.status}` }
        const baseSha = ((await refRes.json()) as any).object?.sha
        const newBranch = `flowmatic-widgets-${baseSha.slice(0, 7)}`
        const cr = await ghFetch(cfg.token, `/repos/${cfg.repo}/git/refs`, { method: 'POST', body: JSON.stringify({ ref: `refs/heads/${newBranch}`, sha: baseSha }) })
        if (!cr.ok && cr.status !== 422) return { applied, error: `branch ${cr.status}` }

        // 1) widget JS file
        const jsPath = 'clawflow-widgets.js'
        let jsSha: string | undefined
        const exJs = await ghFetch(cfg.token, `/repos/${cfg.repo}/contents/${jsPath}?ref=${encodeURIComponent(cfg.branch)}`)
        if (exJs.ok) jsSha = ((await exJs.json()) as any).sha
        const putJs = await ghFetch(cfg.token, `/repos/${cfg.repo}/contents/${jsPath}`, { method: 'PUT', body: JSON.stringify({ message: 'Flowmatic: site widgets JS', content: Buffer.from(js, 'utf-8').toString('base64'), branch: newBranch, ...(jsSha ? { sha: jsSha } : {}) }) })
        if (putJs.ok) applied.push(jsPath)

        // 2) inject <script> into the first detectable layout with </body>
        const tag = '<script src="/clawflow-widgets.js" defer></script>'
        for (const path of LAYOUT_CANDIDATES) {
            const f = await ghFetch(cfg.token, `/repos/${cfg.repo}/contents/${encodeURIComponent(path).replace(/%2F/g, '/')}?ref=${encodeURIComponent(cfg.branch)}`)
            if (!f.ok) continue
            const j = await f.json() as any
            const html = Buffer.from(j.content || '', 'base64').toString('utf-8')
            if (html.includes('clawflow-widgets.js')) { applied.push(`${path} (already)`); break }
            if (!/<\/body>/i.test(html)) continue
            const injected = html.replace(/<\/body>/i, `${tag}\n</body>`)
            const put = await ghFetch(cfg.token, `/repos/${cfg.repo}/contents/${encodeURIComponent(path).replace(/%2F/g, '/')}`, { method: 'PUT', body: JSON.stringify({ message: 'Flowmatic: include site widgets', content: Buffer.from(injected, 'utf-8').toString('base64'), sha: j.sha, branch: newBranch }) })
            if (put.ok) { applied.push(`${path} (injected)`); break }
        }

        const pr = await ghFetch(cfg.token, `/repos/${cfg.repo}/pulls`, { method: 'POST', body: JSON.stringify({ title: 'Flowmatic: site widgets (WhatsApp/call + popup)', head: newBranch, base: cfg.branch, body: 'Adds floating WhatsApp/call button + exit-intent popup. If no layout was auto-injected, include `/clawflow-widgets.js` before </body>.' }) })
        const prUrl = pr.ok ? ((await pr.json()) as any).html_url : `branch:${newBranch}`
        return { prUrl, applied }
    } catch (e) { return { applied, error: (e as Error).message } }
}

export async function runSiteWidget(
    instanceId: string,
    opts: { agentId?: string | null; mode: WidgetMode; taskText?: string; dryRun?: boolean } = { mode: 'buttons' },
): Promise<SiteWidgetResult> {
    const result: SiteWidgetResult = { ok: false, integrationMissing: false, needsPhone: false, platform: null, applied: [] }
    // Read the agent row directly — readResearchData() returned a trimmed shape
    // missing results.audience_personas.dfsData (where the GMB phone lives).
    const { db } = await import('@/db')
    const { matehAgents } = await import('@/db/schema')
    const { eq } = await import('drizzle-orm')
    const [agentRow] = opts.agentId ? await db.select().from(matehAgents).where(eq(matehAgents.id, opts.agentId)) : []
    const rd: any = (agentRow?.researchData as any) || {}
    const businessName = rd?.answers?.businessName || 'העסק'
    const { whatsapp, call } = resolvePhone(rd)

    // Build the partial config for THIS task's widget kind.
    const partial: any = {}
    if (opts.mode === 'buttons') {
        if (!whatsapp && !call) { result.needsPhone = true; return result }
        if (whatsapp) partial.whatsapp = { enabled: true, phone: whatsapp, message: `שלום, הגעתי מהאתר של ${businessName} ואשמח לפרטים` }
        if (call) partial.call = { enabled: true, phone: call }
    } else {
        partial.exitPopup = buildPopup(rd, opts.taskText || '', whatsapp)
    }

    // WordPress path
    const wp = await loadWpConfig(instanceId, opts.agentId) as WpCfg | null
    if (wp) {
        result.platform = 'wordpress'
        try {
            const base = norm(wp.url)
            const cur = await fetch(`${base}/wp-json/clawflow/v1/site-widgets`, { headers: { Authorization: auth(wp) }, signal: AbortSignal.timeout(20000) })
            let merged: any = {}
            if (cur.ok) { const j = await cur.json().catch(() => ({})) as any; merged = (j && j.config && typeof j.config === 'object') ? j.config : {} }
            merged = { ...merged, ...partial }
            if (!opts.dryRun) {
                const post = await fetch(`${base}/wp-json/clawflow/v1/site-widgets`, { method: 'POST', headers: { Authorization: auth(wp), 'Content-Type': 'application/json' }, body: JSON.stringify({ config: merged }), signal: AbortSignal.timeout(20000) })
                if (!post.ok) {
                    const txt = (await post.text().catch(() => '')).slice(0, 200)
                    if (post.status === 404) { result.integrationMissing = true; result.error = 'companion plugin v1.11.0+ required (/site-widgets 404)'; return result }
                    result.error = `${post.status}: ${txt}`; return result
                }
            }
            result.applied = Object.keys(partial)
            result.ok = true
            return result
        } catch (e) { result.error = (e as Error).message; return result }
    }

    // GitHub path
    const gh = await loadGithubConfig(instanceId, opts.agentId)
    if (gh) {
        result.platform = 'github'
        // For GitHub we need the FULL config (no live merge source) — build both kinds we know.
        const full: any = { ...partial }
        if (opts.mode === 'popup' && (whatsapp || call)) {
            if (whatsapp) full.whatsapp = { enabled: true, phone: whatsapp, message: `שלום, הגעתי מהאתר של ${businessName}` }
            if (call) full.call = { enabled: true, phone: call }
        }
        if (opts.dryRun) { result.applied = Object.keys(full); result.ok = true; return result }
        const js = buildGithubWidgetJs(full)
        const r = await applyGithub({ token: gh.token, repo: gh.repo, branch: gh.branch }, js)
        result.applied = r.applied; result.prUrl = r.prUrl; result.error = r.error
        result.ok = !!r.prUrl && !r.error
        return result
    }

    result.integrationMissing = true
    return result
}