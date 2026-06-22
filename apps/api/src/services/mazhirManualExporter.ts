/**
 * Mazhir Manual Exporter — generates a self-contained HTML document with
 * step-by-step instructions for clients in DEGRADED MODE (no Google Ads
 * API access — typically missing developer token or customerId).
 *
 * Output is HTML (browser-printable to PDF). Client follows steps in
 * Google Ads UI by hand. Includes:
 *   - Per-campaign setup sequence (budgets, bid strategy, geo, schedule)
 *   - Per-ad-group: keywords (with vol/CPC), negatives, RSA assets
 *   - Extension setups (sitelinks, callouts, structured snippets)
 *   - Conversion tracking checklist (GTM, Enhanced Conversions, Consent Mode)
 *   - Landing page recommendations
 *   - Bid transition gates (week 1-4 → after 30 conv)
 *
 * Referenced from agent_outputs row.content for the media plan output, so
 * the dashboard preview shows the formatted instructions inline.
 */

import type { MediaPlan, MazhirAudit, PaidProfile } from '@/controllers/hosting/agentSetup'

function esc(s: any): string {
    if (s == null) return ''
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
}

export function exportPlanAsManualHtml(args: {
    plan: MediaPlan
    audit: MazhirAudit
    paidProfile: PaidProfile
    businessName: string
}): string {
    const { plan, audit, paidProfile, businessName } = args
    const ctp = (plan as any).conversionTrackingPlan || {}
    const transition = (plan as any).transitionToTcpa
    const lpRecs = (plan as any).landingPageRecommendations || []
    const escalation = (plan as any).budgetEscalation

    const totalDaily = (plan.campaigns || []).reduce((s, c) => s + (c.dailyBudgetIls || 0), 0)

    // Campaigns blocks
    const campaigns = (plan.campaigns || []).map((c: any, idx: number) => {
        const adGroups = (c.adGroups || []).map((g: any, gi: number) => {
            const kwTable = (g.keywords || []).map((k: any) =>
                `<tr><td>${esc(k.text)}</td><td>${esc(k.matchType)}</td><td>${k.vol ?? '?'}</td><td>${k.cpc ? '₪' + k.cpc : '?'}</td></tr>`
            ).join('')
            const headlines = (g.headlines || []).map((h: string) => `<li>${esc(h)}</li>`).join('')
            const descriptions = (g.descriptions || []).map((d: string) => `<li>${esc(d)}</li>`).join('')
            const sitelinks = (g.sitelinks || []).map((s: any) =>
                `<li><strong>${esc(s.text)}</strong> → ${esc(s.url)}<br><small>${esc(s.description1 || '')} ${esc(s.description2 || '')}</small></li>`
            ).join('')
            const callouts = (g.callouts || []).map((c: string) => `<span class="chip">${esc(c)}</span>`).join(' ')
            return `
        <div class="ad-group">
          <h3>קבוצת מודעות ${gi + 1}: ${esc(g.name)}</h3>
          ${g.themeIntent ? `<p class="theme">${esc(g.themeIntent)}</p>` : ''}
          <p><strong>finalUrl:</strong> <code>${esc(g.finalUrl || '')}</code></p>
          <p><strong>maxCpc:</strong> ₪${esc(g.maxCpcIls)}</p>
          <h4>מילות מפתח (${(g.keywords || []).length})</h4>
          <table>
            <thead><tr><th>Keyword</th><th>Match</th><th>Vol/mo</th><th>CPC</th></tr></thead>
            <tbody>${kwTable}</tbody>
          </table>
          <h4>כותרות RSA (${(g.headlines || []).length})</h4>
          <ul class="cols">${headlines}</ul>
          <h4>תיאורים RSA (${(g.descriptions || []).length})</h4>
          <ul>${descriptions}</ul>
          ${sitelinks ? `<h4>Sitelinks</h4><ul>${sitelinks}</ul>` : ''}
          ${callouts ? `<h4>Callouts</h4><div class="callouts">${callouts}</div>` : ''}
        </div>`
        }).join('')

        const negatives = ((c.negativeKeywords || []).join(', ')) || (plan.negativeKeywordLibrary?.industry || []).join(', ')
        const sched = (c.schedule || []).map((s: any) =>
            `<li>${(s.days || []).join('+')} ${esc(s.hours)} bid ${s.adjustmentPct >= 0 ? '+' : ''}${s.adjustmentPct}%</li>`
        ).join('')
        const geo = c.geo
            ? `<p><strong>גיאוגרפיה:</strong> ${esc(c.geo.mode)}, רדיוס ${esc(c.geo.radiusKm)} ק"מ סביב ${(c.geo.cities || []).join(', ')}</p>` +
              (c.geo.recommendedExpansion?.length ? `<p class="warn">⚠ הרחבה מומלצת לפי GA4: ${(c.geo.recommendedExpansion || []).map((e: any) => esc(e.city) + ' (' + esc(e.reason) + ')').join('; ')}</p>` : '')
            : ''

        return `
    <section class="campaign">
      <h2>קמפיין ${idx + 1}: ${esc(c.name || c.campaignName)}</h2>
      <div class="meta">
        <span><strong>סוג:</strong> ${esc(c.type || c.campaignType)}</span>
        <span><strong>תקציב יומי:</strong> ₪${esc(c.dailyBudgetIls)}</span>
        <span><strong>אסטרטגיה (שבוע 1-4):</strong> ${esc(c.bidStrategy || c.biddingStrategy)}</span>
        ${c.bidStrategyTransition ? `<span><strong>מעבר אחרי 30 המרות:</strong> ${esc(c.bidStrategyTransition.weekAfterTransition)}</span>` : ''}
      </div>
      ${geo}
      ${sched ? `<h4>לוח זמנים</h4><ul>${sched}</ul>` : ''}
      ${negatives ? `<h4>מילות שלילה</h4><p class="negatives">${esc(negatives)}</p>` : ''}
      ${adGroups}
    </section>`
    }).join('')

    // ── Meta / Instagram full-funnel (rendered in Hebrew as a manual brief) ──
    const metaCampaigns = ((plan as any).metaCampaigns || []) as any[]
    const metaSection = metaCampaigns.length ? `
  <h2>📱 Meta / Instagram — משפך מלא (Facebook + Instagram)</h2>
  <p style="background:#FEF3C7;padding:10px;border-radius:6px">אם חשבון Meta Business עדיין לא מחובר — זהו <strong>בריף ביצוע ידני</strong>: הקימו את הקמפיינים ב-Meta Ads Manager לפי הפירוט (התסריטים מוכנים להפקה), או חברו את Meta תחת "חיבורים" והמערכת תקים אותם אוטומטית (PAUSED).</p>
  ${metaCampaigns.map((m: any, i: number) => {
        const tierHe = m.funnelTier === 'awareness' ? 'מודעות (קהל קר)' : m.funnelTier === 'lead_magnet' ? 'מגנט לידים (חימום)' : m.funnelTier === 'retargeting' ? 'ריטרגטינג' : esc(m.funnelTier)
        const concepts = (m.creativeConcepts || []).map((cc: any) => {
            const script = (cc.videoScript || []).map((b: string) => `<li>${esc(b)}</li>`).join('')
            const kindHe = cc.kind === 'offer_product' ? `קריאייטיב הצעה — ${esc(cc.forProduct || 'מוצר')}` : 'קריאייטיב מגנט לידים'
            return `<div class="ad-group">
          <h4>${kindHe} · ${esc(cc.format)}</h4>
          ${cc.hook ? `<p><strong>הוק (0-3 ש'):</strong> ${esc(cc.hook)}</p>` : ''}
          ${cc.primaryText ? `<p><strong>טקסט ראשי:</strong> ${esc(cc.primaryText)}</p>` : ''}
          ${cc.headline ? `<p><strong>כותרת:</strong> ${esc(cc.headline)} · <strong>CTA:</strong> ${esc(cc.cta || '')}</p>` : ''}
          ${cc.leadMagnet ? `<p><strong>מגנט לידים:</strong> ${esc(cc.leadMagnet)}</p>` : ''}
          ${script ? `<p><strong>תסריט וידאו (Reel):</strong></p><ol>${script}</ol>` : ''}
        </div>`
        }).join('')
        const aud = m.audience ? `<p><strong>קהל:</strong> ${esc(m.audience.type || '')} — ${esc(m.audience.definition || '')}</p>` : ''
        return `<section class="campaign">
      <h3>Meta ${i + 1}: ${esc(m.name)} · ${tierHe}</h3>
      <div class="meta"><span><strong>מטרה:</strong> ${esc(m.objective)}</span> <span><strong>תקציב:</strong> ₪${esc(m.dailyBudgetIls)}/יום</span> <span><strong>אופטימיזציה:</strong> ${esc(m.optimization || 'lowest_cost')}</span> <span><strong>שיוך:</strong> 7d-click/1d-view</span></div>
      ${aud}
      ${m.rationale ? `<p class="theme">${esc(m.rationale)}</p>` : ''}
      ${concepts}
    </section>`
    }).join('')}
` : ''

    const lpBlock = lpRecs.length ? `
  <section class="lp-recs">
    <h2>🌐 המלצות לעמודי נחיתה</h2>
    <p class="hint">עמוד נחיתה ייעודי לכל ad group מעלה Quality Score ב-2-3 נקודות, מוריד CPC ב-20-40%.</p>
    ${lpRecs.map((lp: any) => `
      <div class="lp-card ${lp.status === 'exists' ? 'lp-exists' : 'lp-create'}">
        <h3>${esc(lp.adGroupName)} ${lp.status === 'exists' ? '(קיים)' : '(לבנות חדש)'}</h3>
        <p><strong>URL:</strong> <code>${esc(lp.recommendedUrl)}</code></p>
        <p>${esc(lp.contentBrief)}</p>
      </div>
    `).join('')}
  </section>` : ''

    const escalationBlock = escalation ? `
  <section class="escalation">
    <h2>📈 העלאת תקציב לעונות שיא</h2>
    <ul>
      <li><strong>חודשי שיא:</strong> ${(escalation.peakMonths || []).join(', ')}</li>
      <li><strong>multiplier:</strong> ×${esc(escalation.multiplier)}</li>
      ${escalation.recommendedExtraBudgetIls ? `<li><strong>תקציב נוסף:</strong> ₪${esc(escalation.recommendedExtraBudgetIls)}/חודש שיא</li>` : ''}
    </ul>
    ${escalation.rationale ? `<p>${esc(escalation.rationale)}</p>` : ''}
  </section>` : ''

    const setupSteps = (ctp.whatsappSetupSteps || []).map((s: string) => `<li>${esc(s)}</li>`).join('')
    const blockers = (ctp.blockers || []).map((b: string) => `<li>${esc(b)}</li>`).join('')

    const transitionBlock = transition ? `
  <section class="transition">
    <h2>🔁 מעבר אסטרטגיה (אחרי ${esc(transition.triggerConvCount || 30)} המרות)</h2>
    <ul>
      <li><strong>שבוע 1-4:</strong> ${esc(transition.weeks1to2BidStrategy || 'MAXIMIZE_CLICKS')}</li>
      <li><strong>שער המעבר:</strong> ${esc(transition.weekTransitionGate || '30+ המרות תוך 30 יום + Enhanced Conversions פעיל')}</li>
      <li><strong>יעד tCPA:</strong> ₪${esc(transition.suggestedCpaIls)}</li>
      <li><strong>הסבר חישוב:</strong> ${esc(transition.derivation || '')}</li>
    </ul>
  </section>` : ''

    return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="UTF-8">
<title>Manual Setup — ${esc(businessName)} — Google Ads Plan</title>
<style>
  body { font-family: 'Arial Hebrew', Arial, sans-serif; margin: 24px; color: #1F2937; line-height: 1.6; }
  h1 { color: #1E40AF; border-bottom: 3px solid #2563EB; padding-bottom: 8px; }
  h2 { color: #1F2937; margin-top: 28px; padding-top: 12px; border-top: 1px solid #E5E7EB; }
  h3 { color: #0F766E; margin-top: 18px; }
  h4 { color: #6B7280; margin-top: 12px; font-size: 0.92rem; }
  .meta { background: #F9FAFB; padding: 12px; border-radius: 8px; }
  .meta span { display: inline-block; margin-left: 16px; font-size: 0.88rem; }
  .hint { color: #6B7280; font-size: 0.86rem; }
  .warn { background: #FFFBEB; padding: 8px 12px; border-right: 4px solid #F59E0B; }
  .negatives { background: #FEF2F2; padding: 8px 12px; border-radius: 6px; font-family: monospace; font-size: 0.84rem; }
  .ad-group { background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 14px 16px; margin-bottom: 16px; }
  .theme { color: #6B7280; font-style: italic; font-size: 0.86rem; }
  table { width: 100%; border-collapse: collapse; margin: 8px 0; }
  th, td { border: 1px solid #E5E7EB; padding: 6px 10px; text-align: right; font-size: 0.84rem; }
  th { background: #F3F4F6; font-weight: 600; }
  ul { padding-right: 20px; }
  ul.cols { columns: 2; }
  code { background: #F3F4F6; padding: 2px 6px; border-radius: 4px; font-size: 0.86rem; }
  .chip { display: inline-block; background: #ECFDF5; color: #065F46; padding: 4px 10px; border-radius: 999px; font-size: 0.78rem; margin: 4px 2px; }
  .lp-card { background: #fff; border: 1px solid #E5E7EB; border-radius: 8px; padding: 12px; margin-bottom: 8px; }
  .lp-create { border-right: 4px solid #DC2626; }
  .lp-exists { border-right: 4px solid #10B981; }
  .escalation { background: #FFFBEB; border: 1px solid #FCD34D; border-radius: 8px; padding: 14px; margin-top: 18px; }
  .transition { background: #F0F9FF; border: 1px solid #BAE6FD; border-radius: 8px; padding: 14px; margin-top: 18px; }
  .blockers { background: #FEF2F2; border: 1px solid #FCA5A5; border-radius: 8px; padding: 14px; margin-top: 18px; }
  .blockers li { margin-bottom: 6px; }
  @media print { body { margin: 0; padding: 16px; } h2 { page-break-before: auto; } }
</style>
</head>
<body>
  <h1>תוכנית מדיה — ${esc(businessName)}</h1>
  <p>
    <strong>מתודולוגיה:</strong> ${esc(plan.methodology?.framework || '?')}<br>
    <strong>תקציב חודשי:</strong> ₪${esc(paidProfile.monthlyBudgetIls)} · תקציב יומי כולל: ₪${totalDaily}<br>
    <strong>זמן השקה:</strong> ${esc(plan.estimatedTimeToLaunch)}<br>
    <strong>מטרה:</strong> ${esc(paidProfile.primaryGoal)}
  </p>

  <section class="blockers">
    <h2>🚫 חובה לפני השקה</h2>
    <ol>${blockers || '<li>(אין חוסמים)</li>'}</ol>
  </section>

  ${ctp.whatsappClickEvent ? `
  <section>
    <h2>💬 הגדרת WhatsApp כ-Conversion Action</h2>
    <ol>${setupSteps}</ol>
  </section>` : ''}

  ${transitionBlock}
  ${escalationBlock}
  ${lpBlock}

  <h2>קמפיינים ופירוט מלא — Google</h2>
  ${campaigns}

  ${metaSection}

  <hr>
  <p style="font-size:0.74rem;color:#9CA3AF;text-align:center;margin-top:30px">
    Generated by Mazhir · Storage4you Storage Plan · ${new Date().toLocaleDateString('he-IL')}
  </p>
</body>
</html>`
}