/**
 * Brand Book Exporter — production-grade Hebrew brand book document.
 *
 * NOT a database printout. A real brand book — magazine-quality layout,
 * cover page, narrative sections, color stories, voice in action examples,
 * persona deep dives. Reads ALL available client context:
 *   - researchData.stage1..5 (full market research)
 *   - researchData.chosenScenario + strategy
 *   - researchData.mazhirAudit (GA4 ground truth, top cities, peak seasons)
 *   - brandBook (voice, archetype, vocabulary, personas, etc)
 *   - brandBook.businessName, taglines, mission, manifesto
 *
 * AI narrative enhancer (optional, when apiKey provided): Sonnet 4.6
 * generates Hebrew narrative connectors that turn data into a story —
 * archetype rationale paragraphs, color philosophy, voice-in-action
 * examples, persona empathy summaries.
 *
 * Output: self-contained HTML, fonts loaded from Google Fonts, fully
 * print-ready (Ctrl+P → Save as PDF). Production look.
 */

import type { BrandBookV2 } from '../../../../packages/shared/src/brand/brandBookV2'

export interface ExportContext {
    book: BrandBookV2
    /** Full instance research+strategy data — drives narrative depth */
    researchData?: any
    /** When provided, runs Sonnet narrative enhancement */
    apiKey?: string
}

function esc(s: any): string {
    if (s == null) return ''
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
}

function hexToRgb(hex: string): [number, number, number] | null {
    const m = hex.replace('#', '')
    if (m.length !== 6) return null
    const r = parseInt(m.slice(0, 2), 16)
    const g = parseInt(m.slice(2, 4), 16)
    const b = parseInt(m.slice(4, 6), 16)
    if (isNaN(r) || isNaN(g) || isNaN(b)) return null
    return [r, g, b]
}

function isLightColor(hex: string): boolean {
    const rgb = hexToRgb(hex)
    if (!rgb) return false
    // Perceived brightness — YIQ
    const yiq = (rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114) / 1000
    return yiq >= 128
}

function archetypeNarrative(arch: string): { name: string; description: string; brandsLikeYou: string } {
    // Pure Hebrew names. Peer brands kept as-is (international brand names — natural).
    const map: Record<string, { name: string; description: string; brandsLikeYou: string }> = {
        innocent: { name: 'התם', description: 'מבטיחים פשטות, אמת וטוהר. הלקוחות שלנו מחפשים שלווה רגשית ומקלט מהמורכבות.', brandsLikeYou: 'Coca-Cola · Dove · Innocent Drinks' },
        sage: { name: 'החכם', description: 'מספקים ידע, אמת ובהירות. הסמכות שלנו נבנית על בסיס מומחיות אמיתית.', brandsLikeYou: 'Google · BBC · Harvard · New York Times' },
        explorer: { name: 'החוקר', description: 'מצדיעים לחופש, גילוי וסקרנות. מובילים את הלקוח להרפתקה הבאה שלו.', brandsLikeYou: 'Patagonia · Jeep · The North Face · Land Rover' },
        outlaw: { name: 'המורד', description: 'משברים את הסטטוס קוו. מציעים חופש מהכללים ודרך אחרת.', brandsLikeYou: 'Harley-Davidson · Diesel · Virgin · MTV' },
        magician: { name: 'הקוסם', description: 'הופכים חזון למציאות. מבטיחים טרנספורמציה — מצב שונה אחרי שמשתמשים בנו.', brandsLikeYou: 'Disney · Apple · Tesla · Polaroid' },
        hero: { name: 'הגיבור', description: 'מנצחים אתגרים ומוכיחים ערך דרך הישג. מעודדים את הלקוח לעמוד מול קושי.', brandsLikeYou: 'Nike · BMW · FedEx · Adidas' },
        lover: { name: 'האהוב', description: 'מציעים יופי, אינטימיות וחיבור רגשי. הופכים כל חוויה לרומנטית ומשמעותית.', brandsLikeYou: 'Chanel · Victoria\'s Secret · Godiva · Hallmark' },
        jester: { name: 'הליצן', description: 'מביאים שמחה, הומור והרפיה. הופכים אינטראקציה איתנו לחוויה כיפית.', brandsLikeYou: 'Old Spice · M&M\'s · Skittles · IKEA' },
        everyman: { name: 'האדם הפשוט', description: 'שייכים לכולם, ללא יומרות. מעוררים תחושת חברות וקהילה.', brandsLikeYou: 'IKEA · Levi\'s · Target · Home Depot' },
        caregiver: { name: 'המטפל', description: 'מגנים, דואגים ותומכים. מעניקים ללקוחות שלנו שקט נפשי וביטחון רגשי.', brandsLikeYou: 'Volvo · Johnson & Johnson · TOMS · UNICEF · Headspace' },
        ruler: { name: 'השליט', description: 'מציעים שליטה, יוקרה וסטטוס. מבטיחים איכות ויציבות שלא מתפשרת.', brandsLikeYou: 'Rolex · Mercedes-Benz · Microsoft · American Express' },
        creator: { name: 'היוצר', description: 'מאפשרים יצירה ובניין עצמי. נותנים ללקוחות שלנו כלים לביטוי אישי.', brandsLikeYou: 'LEGO · Adobe · Apple · Crayola · Pinterest' },
    }
    return map[arch] || { name: arch, description: '', brandsLikeYou: '' }
}

/**
 * Optional AI narrative enhancement — generates a Hebrew "founder voice"
 * narrative for the cover + intro + per-section connectors. When apiKey
 * not provided, uses static fallback templates.
 */
async function generateAINarrative(ctx: ExportContext): Promise<{
    coverIntro?: string
    archetypeStory?: string
    colorStory?: string
    voiceInAction?: string[]
    personaEmpathy?: Record<string, string>
}> {
    if (!ctx.apiKey) return {}
    const book = ctx.book
    const rd = ctx.researchData || {}

    // Build compact context — first 4K chars from research
    const stage1 = (typeof rd.stage1 === 'string' ? rd.stage1 : '').slice(0, 1500)
    const stage2 = (typeof rd.stage2 === 'string' ? rd.stage2 : '').slice(0, 1500)
    const businessName = book.identity?.businessName?.he || book.identity?.businessName?.en || 'המותג'
    const tagline = book.identity?.tagline?.he || ''
    const archetype = book.voice?.voice?.archetype || ''
    const positioning = book.identity?.positioningStatement?.he || ''
    const mission = book.identity?.mission?.he || ''
    const personas = book.audience?.personas?.items || []

    const personaSummaries = personas.slice(0, 4).map(p => `${p.name}: כאבים=${(p.painPoints || []).slice(0, 2).join('; ')}`).join('\n')

    const system = `אתה brand strategist בכיר שכותב ספר מותג לעסק קטן-בינוני ישראלי. ה-output שלך הוא הקול הנרטיבי של הספר עצמו — נכתב מתוך המותג, לא תצפית חיצונית. כתוב עברית רהוטה ברמת מגזין (Zeh.co.il / Globes) — לא פלאף תאגידי גנרי.

חוקים נוקשים:
1. כל ה-output בעברית. שם המותג נשאר כפי שנמסר (גם אם באנגלית). אסור מילה אחת באנגלית בכל שאר הטקסט.
2. כתיבה בלשון רבים (אתם / לכם / תוכלו) — לעולם לא יחיד.
3. הפנייה למציאות הספציפית של המותג מתוך הנתונים — לא הפשטות.
4. 2-4 משפטים לכל סעיף — חדות, לא קירות טקסט.
5. שיקוף הטון של המותג (חם / רשמי / חד) לפי הארכיטיפ.
6. אסור פליטות באנגלית כמו "brand", "story", "voice" — תרגם תמיד.`

    const user = `מותג: ${businessName}
סלוגן: ${tagline}
ארכיטיפ: ${archetype}
מיצוב: ${positioning}
משימה: ${mission}

תקציר מחקר (שוק + קהל):
${stage1}
${stage2}

פרסונות:
${personaSummaries}

צור JSON בדיוק במבנה הזה (כל הערכים בעברית בלבד — אסור מילה באנגלית):
{
  "coverIntro": "<2-3 משפטים לפתיחת השער — מה הספר הזה, למה הוא חשוב עכשיו. לא 'זה ספר מותג' — אלא הבטחה של המותג לעצמו>",
  "archetypeStory": "<3-4 משפטים על למה דווקא הארכיטיפ הזה מתאים למותג הזה, עם רגע ספציפי אחד מהמחקר/אסטרטגיה. גשר בין תאוריה למציאות>",
  "colorStory": "<2-3 משפטים על מה הצבעים מבטאים עבור המותג הזה ספציפית — רגשי/אסטרטגי, לא 'כחול = רוגע'>",
  "voiceInAction": [
    "<דוגמה 1: איך מקבלים ליד חדש — משפט בעברית בקול הברנד>",
    "<דוגמה 2: איך מתמודדים עם 'יקר מדי'>",
    "<דוגמה 3: איך סוגרים עסקה>",
    "<דוגמה 4: השורה הראשונה ב-WhatsApp>"
  ],
  "personaEmpathy": {
    ${personas.slice(0, 4).map(p => `"${p.id}": "<2 משפטים נכנסים לראש של הפרסונה — מה מטריד אותה בלילה, מה היא מקווה, בקול שלה>"`).join(',\n    ')}
  }
}

החזר JSON בלבד. בלי טקסט נוסף. עברית בלבד.`

    try {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'x-api-key': ctx.apiKey,
                'anthropic-version': '2023-06-01',
                'content-type': 'application/json',
            },
            body: JSON.stringify({
                model: 'claude-sonnet-4-6',
                max_tokens: 3000,
                system,
                messages: [{ role: 'user', content: user }],
            }),
            signal: AbortSignal.timeout(90_000),
        })
        if (!res.ok) return {}
        const j = await res.json() as any
        const text = j?.content?.[0]?.text || ''
        const m = text.match(/\{[\s\S]*\}/)
        if (!m) return {}
        return JSON.parse(m[0])
    } catch (err) {
        console.warn('[brandBookExporter] narrative enhancement failed:', (err as Error).message)
        return {}
    }
}

export async function exportBrandBookAsHtml(input: BrandBookV2 | ExportContext): Promise<string> {
    // Backwards compat — accept book directly
    const ctx: ExportContext = ('book' in (input as any))
        ? (input as ExportContext)
        : { book: input as BrandBookV2 }
    const book = ctx.book
    const rd = ctx.researchData || {}
    const narrative = await generateAINarrative(ctx)

    const ident = book.identity || {}
    const visual = book.visual || {}
    const voice = book.voice?.voice
    const messaging = book.voice?.messaging
    const personas = book.audience?.personas?.items || []
    const compliance = book.compliance?.compliance

    const businessName = ident.businessName?.he || ident.businessName?.en || 'המותג'
    const tagline = ident.tagline?.he || ident.tagline?.en || ''
    const positioning = ident.positioningStatement?.he || ident.positioningStatement?.en || ''
    const mission = ident.mission?.he || ident.mission?.en || ''
    const manifesto = ident.manifesto?.he || ident.manifesto?.en || ''
    const colors = visual.colors
    const primaryHex = colors?.primary?.hex || '#1F2937'
    const accentHex = colors?.accent?.[0]?.hex || colors?.secondary?.[0]?.hex || '#0F766E'
    const fontHe = visual.typography?.primaryFontHe?.family || 'Heebo'
    const fontEn = visual.typography?.primaryFontEn?.family || 'Inter'

    const archetype = voice?.archetype || ''
    const archetypeData = archetypeNarrative(archetype)
    const isLightPrimary = isLightColor(primaryHex)

    // ─── Cover page ─────────────────────────────────────────────────────
    const coverIntro = narrative.coverIntro || `${tagline}${tagline ? ' · ' : ''}המסמך הזה הוא הזיכרון הקולקטיבי של ${businessName} — הקול, המראה, הערכים והאנשים. כל מה שיוצא מאיתנו עובר דרכו.`

    // ─── Color stories ──────────────────────────────────────────────────
    const colorStory = narrative.colorStory || `הצבעים שלנו לא נבחרו בטעות — הם משקפים את האמירה שאנחנו רוצים להעביר.`

    const colorPaletteHtml = colors ? `
      <div class="color-grid">
        ${colors.primary ? renderColorCard(colors.primary, 'primary', 'large') : ''}
        ${(colors.secondary || []).map((c: any) => renderColorCard(c, 'secondary')).join('')}
        ${(colors.accent || []).map((c: any) => renderColorCard(c, 'accent')).join('')}
      </div>
      ${(colors.neutral || []).length ? `
      <h4 style="margin-top:24px">צבעים ניטרליים</h4>
      <div class="color-grid neutral">
        ${(colors.neutral || []).map((c: any) => renderColorCard(c, 'neutral', 'small')).join('')}
      </div>` : ''}
    ` : '<p class="missing">פלטת צבעים עדיין לא הוגדרה</p>'

    function renderColorCard(c: any, role: string, size: 'small' | 'large' | '' = '') {
        const fg = isLightColor(c.hex || '#000') ? '#1F2937' : '#fff'
        const cls = size === 'large' ? 'color-card large' : size === 'small' ? 'color-card small' : 'color-card'
        return `<div class="${cls}" style="background:${esc(c.hex || '#ccc')};color:${fg}">
          <div class="color-name">${esc(c.name || role)}</div>
          <div class="color-hex">${esc(c.hex || '')}</div>
          ${c.usage ? `<div class="color-usage">${esc(c.usage)}</div>` : ''}
        </div>`
    }

    // ─── Voice in Action ────────────────────────────────────────────────
    const voiceExamples = narrative.voiceInAction || (voice?.examples || []).slice(0, 4).map((e: any) => e?.good || '')
    const voiceInActionHtml = voiceExamples.length ? `
      <div class="voice-action">
        <h4>הקול בפעולה — איך אנחנו מדברים</h4>
        ${voiceExamples.map((ex: string, i: number) => ex ? `
          <div class="voice-quote">
            <div class="voice-num">${i + 1}</div>
            <div class="voice-text">"${esc(ex)}"</div>
          </div>` : '').join('')}
      </div>
    ` : ''

    const doDontHtml = (voice?.do?.length || voice?.dont?.length) ? `
      <div class="do-dont-grid">
        <div class="do-block">
          <div class="block-header">✓ אנחנו כן</div>
          <ul>${(voice?.do || []).map((d: string) => `<li>${esc(d)}</li>`).join('')}</ul>
        </div>
        <div class="dont-block">
          <div class="block-header">✗ אנחנו לא</div>
          <ul>${(voice?.dont || []).map((d: string) => `<li>${esc(d)}</li>`).join('')}</ul>
        </div>
      </div>
    ` : ''

    // ─── Vocabulary ─────────────────────────────────────────────────────
    const vocabHtml = (voice?.vocabulary?.approved?.length || voice?.vocabulary?.banned?.length) ? `
      <div class="vocab-grid">
        <div class="vocab-block approved">
          <div class="block-header">מילים שאנחנו אומרים</div>
          <div class="vocab-cloud">${(voice?.vocabulary?.approved || []).map(t => `<span class="vocab-pill approved-pill">${esc(t)}</span>`).join('')}</div>
        </div>
        <div class="vocab-block banned">
          <div class="block-header">מילים שאנחנו לא אומרים</div>
          <div class="vocab-cloud">${(voice?.vocabulary?.banned || []).map(t => `<span class="vocab-pill banned-pill">${esc(t)}</span>`).join('')}</div>
        </div>
      </div>
    ` : ''

    // ─── Personas ───────────────────────────────────────────────────────
    const personaEmpathy = narrative.personaEmpathy || {}
    const personasHtml = personas.map((p: any) => {
        const empathy = personaEmpathy[p.id] || ''
        const channelLabels: Record<string, string> = {
            search: 'חיפוש בגוגל', whatsapp: 'WhatsApp', phone: 'טלפון', email: 'אימייל',
            walk_in: 'הגעה פיזית', meta: 'Facebook/Instagram', tiktok: 'TikTok', display: 'באנרים',
            youtube: 'YouTube',
        }
        return `
        <div class="persona-card" style="border-right:6px solid ${primaryHex}">
          ${p.avatarUrl ? `<img src="${esc(p.avatarUrl)}" class="persona-avatar">` : `<div class="persona-avatar-placeholder" style="background:${primaryHex}">${esc(p.name?.charAt(0) || '?')}</div>`}
          <div class="persona-content">
            <h3>${esc(p.name)}</h3>
            ${empathy ? `<p class="persona-empathy">"${esc(empathy)}"</p>` : ''}
            ${p.demographics ? `<p class="persona-demo"><strong>פרופיל:</strong> ${p.demographics.ageRange ? `גיל ${p.demographics.ageRange.join('-')}, ` : ''}${esc(p.demographics.gender || '')}${p.demographics.familyStatus ? `, ${esc(p.demographics.familyStatus)}` : ''}${p.demographics.location ? `, ${esc(p.demographics.location)}` : ''}</p>` : ''}
            ${p.psychographics?.lifestyle ? `<p class="persona-lifestyle"><strong>סגנון חיים:</strong> ${esc(p.psychographics.lifestyle)}</p>` : ''}
            <div class="persona-pillars">
              ${p.painPoints?.length ? `
                <div class="persona-pillar">
                  <div class="pillar-title">⚡ כאבים</div>
                  <ul>${p.painPoints.map((v: string) => `<li>${esc(v)}</li>`).join('')}</ul>
                </div>` : ''}
              ${p.decisionTriggers?.length ? `
                <div class="persona-pillar">
                  <div class="pillar-title">🎯 טריגרים להחלטה</div>
                  <ul>${p.decisionTriggers.map((v: string) => `<li>${esc(v)}</li>`).join('')}</ul>
                </div>` : ''}
              ${p.messageHooks?.length ? `
                <div class="persona-pillar">
                  <div class="pillar-title">💬 משפטים שמדברים אליהם</div>
                  <ul>${p.messageHooks.map((v: string) => `<li class="message-hook">"${esc(v)}"</li>`).join('')}</ul>
                </div>` : ''}
            </div>
            ${p.channelPreferences?.length ? `<div class="persona-channels"><strong>איפה הם:</strong> ${p.channelPreferences.map((c: string) => channelLabels[c] || c).join(' · ')}</div>` : ''}
          </div>
        </div>`
    }).join('')

    // ─── Logo gallery ───────────────────────────────────────────────────
    const logo = visual.logo
    const logoVariantsHtml = logo ? `
      <div class="logo-gallery">
        ${logo.primary?.url ? `<div class="logo-cell"><div class="logo-frame"><img src="${esc(logo.primary.url)}"></div><span class="logo-label">לוגו ראשי</span></div>` : ''}
        ${logo.icon?.url ? `<div class="logo-cell"><div class="logo-frame"><img src="${esc(logo.icon.url)}"></div><span class="logo-label">סמל בלבד</span></div>` : ''}
        ${logo.monochromeBlack?.url ? `<div class="logo-cell"><div class="logo-frame light-bg"><img src="${esc(logo.monochromeBlack.url)}"></div><span class="logo-label">מונוכרום שחור</span></div>` : ''}
        ${logo.monochromeWhite?.url ? `<div class="logo-cell"><div class="logo-frame dark-bg"><img src="${esc(logo.monochromeWhite.url)}"></div><span class="logo-label">מונוכרום לבן</span></div>` : ''}
        ${logo.favicon?.url ? `<div class="logo-cell"><div class="logo-frame small"><img src="${esc(logo.favicon.url)}" style="max-height:36px"></div><span class="logo-label">Favicon</span></div>` : ''}
        ${logo.socialAvatar?.url ? `<div class="logo-cell"><div class="logo-frame circle"><img src="${esc(logo.socialAvatar.url)}"></div><span class="logo-label">אווטאר חברתי</span></div>` : ''}
      </div>
    ` : '<p class="missing">לוגו עדיין לא הועלה</p>'

    // ─── Audit signal block (when present) ──────────────────────────────
    const audit = rd.mazhirAudit
    const auditSignalHtml = audit ? `
      <div class="audit-signal">
        <h4>איך נראה הקהל בנתונים</h4>
        <div class="audit-grid">
          ${audit.estimatedMonthlyConversions ? `<div class="audit-stat"><div class="stat-num">${audit.estimatedMonthlyConversions.expected}</div><div class="stat-label">לידים צפויים/חודש</div></div>` : ''}
          ${audit.sourceCoverage?.ga4?.totalConversions ? `<div class="audit-stat"><div class="stat-num">${audit.sourceCoverage.ga4.totalConversions}</div><div class="stat-label">המרות GA4 (12 חודשים)</div></div>` : ''}
          ${audit.methodology ? `<div class="audit-stat"><div class="stat-num">${esc(audit.methodology)}</div><div class="stat-label">מתודולוגיה</div></div>` : ''}
        </div>
      </div>
    ` : ''

    // ─── Build full HTML ────────────────────────────────────────────────
    return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="UTF-8">
<title>${esc(businessName)} — ספר מותג</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=${encodeURIComponent(fontHe).replace(/%20/g, '+')}:wght@300;400;500;700;900&family=${encodeURIComponent(fontEn).replace(/%20/g, '+')}:wght@300;400;500;700&display=swap" rel="stylesheet">
<style>
  :root {
    --primary: ${primaryHex};
    --primary-fg: ${isLightPrimary ? '#1F2937' : '#fff'};
    --accent: ${accentHex};
    --font-he: '${fontHe}', 'Arial Hebrew', Arial, sans-serif;
    --font-en: '${fontEn}', Inter, system-ui, sans-serif;
  }
  * { box-sizing: border-box; }
  body {
    font-family: var(--font-he);
    color: #1F2937;
    line-height: 1.7;
    margin: 0;
    background: #FAFBFC;
  }
  .page {
    max-width: 920px;
    margin: 0 auto;
    background: #fff;
    padding: 64px 56px;
    margin-bottom: 24px;
    box-shadow: 0 4px 20px rgba(0,0,0,.04);
    border-radius: 4px;
  }
  /* ── Cover ── */
  .cover {
    background: linear-gradient(135deg, var(--primary) 0%, var(--accent) 100%);
    color: var(--primary-fg);
    text-align: center;
    padding: 90px 56px 70px;
    position: relative;
    overflow: hidden;
    min-height: 600px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
  }
  .cover::before {
    content: '';
    position: absolute;
    top: -100px; right: -100px;
    width: 400px; height: 400px;
    background: rgba(255,255,255,.08);
    border-radius: 50%;
  }
  .cover::after {
    content: '';
    position: absolute;
    bottom: -150px; left: -150px;
    width: 500px; height: 500px;
    background: rgba(0,0,0,.08);
    border-radius: 50%;
  }
  .cover > * { position: relative; z-index: 1; }
  .cover-eyebrow {
    font-size: 0.78rem;
    letter-spacing: 4px;
    text-transform: uppercase;
    opacity: .75;
    margin-bottom: 18px;
  }
  .cover-logo {
    max-height: 130px;
    margin-bottom: 28px;
    filter: drop-shadow(0 4px 14px rgba(0,0,0,.1));
  }
  .cover h1 {
    font-size: 3.6rem;
    font-weight: 900;
    margin: 0 0 12px;
    letter-spacing: -1px;
    line-height: 1.1;
  }
  .cover-tagline {
    font-size: 1.4rem;
    font-weight: 300;
    opacity: .9;
    margin: 0 0 32px;
    max-width: 600px;
    line-height: 1.4;
  }
  .cover-intro {
    max-width: 580px;
    font-size: 1rem;
    line-height: 1.8;
    opacity: .92;
    margin: 0 auto;
    background: rgba(255,255,255,.1);
    padding: 20px 26px;
    border-radius: 8px;
    backdrop-filter: blur(8px);
  }
  .cover-meta {
    margin-top: 50px;
    font-size: 0.78rem;
    opacity: .65;
    letter-spacing: 1px;
  }
  /* ── Section headers ── */
  h2 {
    font-size: 0.78rem;
    font-weight: 700;
    color: var(--accent);
    text-transform: uppercase;
    letter-spacing: 4px;
    margin: 0 0 8px;
  }
  .section-title {
    font-size: 2.4rem;
    font-weight: 900;
    color: #111827;
    margin: 0 0 12px;
    line-height: 1.1;
    letter-spacing: -0.5px;
  }
  .section-lead {
    font-size: 1.1rem;
    color: #4B5563;
    line-height: 1.7;
    margin: 0 0 36px;
    max-width: 720px;
  }
  h3 {
    font-size: 1.3rem;
    color: #111827;
    margin-top: 28px;
    font-weight: 700;
  }
  h4 {
    color: #6B7280;
    font-weight: 600;
    margin-top: 18px;
    font-size: 0.94rem;
    letter-spacing: 0.5px;
  }
  /* ── TOC ── */
  .toc {
    background: #F9FAFB;
    border: 1px solid #E5E7EB;
    border-radius: 12px;
    padding: 32px 40px;
  }
  .toc h2 { color: #6B7280; }
  .toc ol { list-style: none; padding: 0; counter-reset: item; }
  .toc li {
    counter-increment: item;
    border-bottom: 1px dashed #E5E7EB;
    padding: 10px 0;
    font-size: 1.04rem;
    display: flex;
    align-items: baseline;
  }
  .toc li::before {
    content: counter(item, decimal-leading-zero) '.';
    color: var(--accent);
    font-weight: 700;
    margin-left: 14px;
    font-size: 0.86rem;
    min-width: 30px;
  }
  .toc li:last-child { border-bottom: none; }
  .toc a { color: #1F2937; text-decoration: none; flex: 1; }
  .toc a:hover { color: var(--primary); }
  /* ── Identity table ── */
  .identity-grid {
    display: grid;
    grid-template-columns: 200px 1fr;
    gap: 0;
    background: #F9FAFB;
    border-radius: 12px;
    overflow: hidden;
  }
  .identity-grid > * {
    padding: 18px 22px;
    border-bottom: 1px solid #fff;
  }
  .identity-grid > div:nth-child(odd) {
    background: #F3F4F6;
    font-weight: 600;
    color: #6B7280;
    font-size: 0.86rem;
  }
  .identity-grid > div:last-child,
  .identity-grid > div:nth-last-child(2) {
    border-bottom: none;
  }
  /* ── Manifesto ── */
  .manifesto {
    background: linear-gradient(135deg, #F9FAFB 0%, #fff 100%);
    border-right: 6px solid var(--primary);
    padding: 32px 40px;
    margin: 28px 0;
    border-radius: 8px;
    font-size: 1.1rem;
    line-height: 1.9;
    color: #1F2937;
  }
  /* ── Archetype card ── */
  .archetype-card {
    background: linear-gradient(135deg, ${primaryHex}10 0%, ${accentHex}08 100%);
    border: 2px solid ${primaryHex}25;
    border-radius: 16px;
    padding: 32px 36px;
    margin: 24px 0;
  }
  .archetype-name {
    font-size: 2rem;
    font-weight: 900;
    color: var(--primary);
    margin: 0 0 8px;
  }
  .archetype-desc {
    font-size: 1.04rem;
    color: #4B5563;
    margin: 0 0 18px;
  }
  .archetype-story {
    font-size: 1.04rem;
    color: #1F2937;
    line-height: 1.8;
    padding: 16px 20px;
    background: #fff;
    border-radius: 8px;
    margin: 18px 0;
  }
  .archetype-peers {
    font-size: 0.86rem;
    color: #6B7280;
  }
  .archetype-peers strong { color: var(--accent); }
  /* ── Logo gallery ── */
  .logo-gallery {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 20px;
    margin: 24px 0;
  }
  .logo-cell {
    text-align: center;
  }
  .logo-frame {
    background: #fff;
    border: 1px solid #E5E7EB;
    border-radius: 10px;
    padding: 28px 16px;
    height: 160px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 8px;
  }
  .logo-frame.dark-bg { background: #111827; }
  .logo-frame.light-bg { background: #F9FAFB; }
  .logo-frame.small { height: 100px; }
  .logo-frame.circle { border-radius: 50%; padding: 16px; }
  .logo-frame img { max-width: 100%; max-height: 100%; object-fit: contain; }
  .logo-label {
    display: block;
    font-size: 0.78rem;
    color: #6B7280;
    text-transform: uppercase;
    letter-spacing: 1.5px;
  }
  /* ── Color cards ── */
  .color-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 14px;
    margin: 20px 0;
  }
  .color-card {
    border-radius: 12px;
    padding: 80px 22px 22px;
    min-height: 180px;
    box-shadow: 0 2px 8px rgba(0,0,0,.06);
    position: relative;
    overflow: hidden;
  }
  .color-card.large {
    grid-column: span 2;
    min-height: 220px;
    padding-top: 110px;
  }
  .color-card.small { min-height: 100px; padding: 40px 14px 14px; }
  .color-name {
    font-weight: 700;
    font-size: 1.1rem;
    margin-bottom: 4px;
  }
  .color-card.large .color-name { font-size: 1.5rem; }
  .color-card.small .color-name { font-size: 0.86rem; }
  .color-hex {
    font-family: var(--font-en);
    font-size: 0.92rem;
    opacity: .9;
    direction: ltr;
    margin-bottom: 8px;
  }
  .color-usage {
    font-size: 0.78rem;
    opacity: .85;
    line-height: 1.5;
  }
  /* ── Voice ── */
  .voice-summary {
    font-size: 1.4rem;
    color: #1F2937;
    background: #F9FAFB;
    padding: 24px 32px;
    border-right: 6px solid var(--accent);
    border-radius: 8px;
    margin: 18px 0;
    font-weight: 500;
    line-height: 1.5;
  }
  .voice-principles {
    background: #fff;
    border: 1px solid #E5E7EB;
    border-radius: 10px;
    padding: 0;
    margin: 20px 0;
    overflow: hidden;
  }
  .voice-principles li {
    list-style: none;
    padding: 16px 24px;
    border-bottom: 1px solid #F3F4F6;
    font-size: 1.02rem;
    counter-increment: principle;
    position: relative;
    padding-right: 70px;
  }
  .voice-principles { counter-reset: principle; }
  .voice-principles li::before {
    content: counter(principle);
    position: absolute;
    right: 24px;
    top: 16px;
    width: 28px; height: 28px;
    background: var(--primary);
    color: var(--primary-fg);
    border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-weight: 700;
    font-size: 0.86rem;
  }
  .voice-principles li:last-child { border-bottom: none; }
  .do-dont-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
    margin: 24px 0;
  }
  .do-block, .dont-block {
    border-radius: 12px;
    padding: 24px 26px;
  }
  .do-block { background: #F0FDF4; border: 1px solid #BBF7D0; }
  .dont-block { background: #FEF2F2; border: 1px solid #FCA5A5; }
  .block-header {
    font-size: 0.94rem;
    font-weight: 700;
    margin-bottom: 12px;
  }
  .do-block .block-header { color: #15803D; }
  .dont-block .block-header { color: #991B1B; }
  .do-block ul, .dont-block ul, .vocab-block ul { margin: 0; padding-right: 18px; }
  .do-block li, .dont-block li { margin-bottom: 6px; line-height: 1.6; font-size: 0.94rem; }
  .voice-action { margin: 28px 0; }
  .voice-quote {
    background: #fff;
    border: 1px solid #E5E7EB;
    border-radius: 10px;
    padding: 20px 26px;
    margin-bottom: 12px;
    display: flex;
    align-items: flex-start;
    gap: 16px;
  }
  .voice-num {
    flex-shrink: 0;
    width: 32px; height: 32px;
    background: var(--accent);
    color: #fff;
    border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-weight: 700;
    font-size: 0.9rem;
  }
  .voice-text {
    font-size: 1.04rem;
    line-height: 1.7;
    color: #1F2937;
    font-style: italic;
  }
  /* ── Vocabulary ── */
  .vocab-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
    margin: 24px 0;
  }
  .vocab-block { border-radius: 12px; padding: 24px 26px; }
  .vocab-block.approved { background: #F0FDF4; border: 1px solid #BBF7D0; }
  .vocab-block.banned { background: #FEF2F2; border: 1px solid #FCA5A5; }
  .vocab-block.approved .block-header { color: #15803D; }
  .vocab-block.banned .block-header { color: #991B1B; }
  .vocab-cloud {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 12px;
  }
  .vocab-pill {
    padding: 6px 14px;
    border-radius: 999px;
    font-size: 0.92rem;
    font-weight: 500;
  }
  .approved-pill { background: #fff; color: #15803D; border: 1px solid #BBF7D0; }
  .banned-pill { background: #fff; color: #991B1B; border: 1px solid #FCA5A5; text-decoration: line-through; }
  /* ── Personas ── */
  .persona-card {
    display: flex;
    gap: 24px;
    background: #fff;
    border: 1px solid #E5E7EB;
    border-radius: 14px;
    padding: 28px 32px;
    margin-bottom: 20px;
    box-shadow: 0 2px 8px rgba(0,0,0,.04);
  }
  .persona-avatar, .persona-avatar-placeholder {
    flex-shrink: 0;
    width: 80px;
    height: 80px;
    border-radius: 50%;
    object-fit: cover;
  }
  .persona-avatar-placeholder {
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 2rem;
    font-weight: 700;
  }
  .persona-content { flex: 1; }
  .persona-content h3 {
    margin: 0 0 8px;
    font-size: 1.4rem;
    color: #111827;
  }
  .persona-empathy {
    font-size: 1.02rem;
    color: #4B5563;
    font-style: italic;
    line-height: 1.7;
    margin: 12px 0;
    padding: 14px 20px;
    background: #F9FAFB;
    border-radius: 8px;
    border-right: 4px solid var(--accent);
  }
  .persona-demo, .persona-lifestyle {
    font-size: 0.9rem;
    color: #6B7280;
    margin: 4px 0;
  }
  .persona-pillars {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 14px;
    margin-top: 18px;
  }
  .persona-pillar {
    background: #F9FAFB;
    border-radius: 8px;
    padding: 14px 16px;
  }
  .pillar-title {
    font-size: 0.82rem;
    font-weight: 700;
    color: var(--accent);
    margin-bottom: 8px;
  }
  .persona-pillar ul {
    margin: 0;
    padding-right: 16px;
    font-size: 0.86rem;
    line-height: 1.6;
  }
  .persona-pillar li { margin-bottom: 4px; }
  .message-hook { color: #1F2937; font-style: italic; }
  .persona-channels {
    margin-top: 14px;
    font-size: 0.86rem;
    color: #6B7280;
  }
  /* ── Audit signal ── */
  .audit-signal {
    background: linear-gradient(135deg, #EFF6FF 0%, #F0FDF4 100%);
    border: 1px solid #BFDBFE;
    border-radius: 12px;
    padding: 24px 28px;
    margin: 28px 0;
  }
  .audit-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 16px;
    margin-top: 16px;
  }
  .audit-stat {
    background: #fff;
    border-radius: 10px;
    padding: 18px;
    text-align: center;
    border: 1px solid #E5E7EB;
  }
  .stat-num {
    font-size: 2rem;
    font-weight: 900;
    color: var(--primary);
  }
  .stat-label {
    font-size: 0.78rem;
    color: #6B7280;
    margin-top: 4px;
    text-transform: uppercase;
    letter-spacing: 1px;
  }
  /* ── Typography samples ── */
  .typography-sample {
    border: 1px solid #E5E7EB;
    border-radius: 10px;
    padding: 28px 32px;
    margin: 16px 0;
    background: #fff;
  }
  .type-meta {
    font-size: 0.78rem;
    color: #6B7280;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    margin-bottom: 12px;
  }
  .type-sample-1 { font-size: 2.4rem; font-weight: 900; line-height: 1; margin: 0 0 8px; color: #111827; }
  .type-sample-2 { font-size: 1.4rem; font-weight: 500; line-height: 1.4; margin: 0 0 6px; color: #1F2937; }
  .type-sample-3 { font-size: 1rem; font-weight: 400; line-height: 1.6; margin: 0; color: #4B5563; }
  .missing { color: #9CA3AF; font-style: italic; }
  /* ── Footer ── */
  .footer {
    text-align: center;
    padding: 40px 0;
    color: #9CA3AF;
    font-size: 0.78rem;
    margin-top: 40px;
  }
  /* ── Print ── */
  @media print {
    body { background: #fff; }
    .page { box-shadow: none; margin-bottom: 0; padding: 40px 36px; max-width: none; }
    .cover { page-break-after: always; min-height: 90vh; }
    .page { page-break-after: always; }
    .persona-card, .archetype-card, .audit-signal { page-break-inside: avoid; }
    h2, .section-title { page-break-after: avoid; }
  }
</style>
</head>
<body>

<!-- ═══ COVER ═══ -->
<div class="page cover">
  <div class="cover-eyebrow">ספר מותג · גרסה ${book.version}</div>
  ${visual.logo?.primary?.url ? `<img class="cover-logo" src="${esc(visual.logo.primary.url)}">` : ''}
  <h1>${esc(businessName)}</h1>
  ${tagline ? `<p class="cover-tagline">${esc(tagline)}</p>` : ''}
  <div class="cover-intro">${esc(coverIntro)}</div>
  <div class="cover-meta">${book.approvedAt ? `אושר ${new Date(book.approvedAt).toLocaleDateString('he-IL', { day: '2-digit', month: 'long', year: 'numeric' })}` : 'טיוטה פעילה'}</div>
</div>

<!-- ═══ TOC ═══ -->
<div class="page">
  <div class="toc">
    <h2>תוכן עניינים</h2>
    <ol>
      <li><a href="#identity">המי שאנחנו — זהות</a></li>
      ${manifesto ? `<li><a href="#manifesto">המניפסט שלנו</a></li>` : ''}
      ${archetype ? `<li><a href="#archetype">הארכיטיפ שלנו</a></li>` : ''}
      ${visual.logo ? `<li><a href="#logo">הלוגו</a></li>` : ''}
      ${colors ? `<li><a href="#colors">הצבעים שלנו</a></li>` : ''}
      ${visual.typography ? `<li><a href="#typography">הטיפוגרפיה שלנו</a></li>` : ''}
      ${voice ? `<li><a href="#voice">איך אנחנו מדברים — קול</a></li>` : ''}
      ${voice?.vocabulary ? `<li><a href="#vocabulary">המילון שלנו</a></li>` : ''}
      ${messaging ? `<li><a href="#messaging">איך אנחנו מציגים את עצמנו</a></li>` : ''}
      ${personas.length ? `<li><a href="#audience">הקהל שלנו</a></li>` : ''}
      ${audit ? `<li><a href="#data">מה הנתונים אומרים</a></li>` : ''}
      ${compliance?.disclaimers?.length ? `<li><a href="#compliance">הסתייגויות חוקיות</a></li>` : ''}
    </ol>
  </div>
</div>

<!-- ═══ IDENTITY ═══ -->
<div class="page" id="identity">
  <h2>שלב 1</h2>
  <h1 class="section-title">מי אנחנו</h1>
  <p class="section-lead">המסמך הזה מתחיל בשאלה הכי בסיסית — מי אנחנו? לא רק שם וסלוגן, אלא הסיבה שאנחנו קיימים, המבטחה שאנחנו נותנים, והערכים שאנחנו מגינים עליהם.</p>

  <div class="identity-grid">
    <div>שם העסק</div>
    <div><strong>${esc(businessName)}</strong>${ident.businessName?.en && ident.businessName.en !== businessName ? ` · ${esc(ident.businessName.en)}` : ''}</div>
    ${ident.legalName?.value ? `<div>שם רשמי</div><div>${esc(ident.legalName.value)}</div>` : ''}
    ${tagline ? `<div>סלוגן</div><div><em>"${esc(tagline)}"</em></div>` : ''}
    ${mission ? `<div>משימה</div><div>${esc(mission)}</div>` : ''}
    ${positioning ? `<div>מיצוב</div><div>${esc(positioning)}</div>` : ''}
  </div>
</div>

${manifesto ? `
<!-- ═══ MANIFESTO ═══ -->
<div class="page" id="manifesto">
  <h2>שלב 2</h2>
  <h1 class="section-title">המניפסט שלנו</h1>
  <p class="section-lead">המניפסט הוא ההצהרה הציבורית שלנו — המילים שאנחנו אומרים בכל בוקר לעצמנו ולעולם.</p>
  <div class="manifesto">${esc(manifesto)}</div>
</div>
` : ''}

${archetype ? `
<!-- ═══ ARCHETYPE ═══ -->
<div class="page" id="archetype">
  <h2>שלב 3</h2>
  <h1 class="section-title">הארכיטיפ שלנו</h1>
  <p class="section-lead">קארל יונג זיהה 12 ארכיטיפים אוניברסליים שמעצבים את כל המותגים. אנחנו ${archetypeData.name.split(' / ')[0]} — וזה לא במקרה.</p>

  <div class="archetype-card">
    <div class="archetype-name">${esc(archetypeData.name)}</div>
    <p class="archetype-desc">${esc(archetypeData.description)}</p>
    ${narrative.archetypeStory ? `<div class="archetype-story">${esc(narrative.archetypeStory)}</div>` : ''}
    ${archetypeData.brandsLikeYou ? `<p class="archetype-peers"><strong>במשפחה שלנו:</strong> ${esc(archetypeData.brandsLikeYou)}</p>` : ''}
  </div>
</div>
` : ''}

${visual.logo ? `
<!-- ═══ LOGO ═══ -->
<div class="page" id="logo">
  <h2>שלב 4</h2>
  <h1 class="section-title">הלוגו</h1>
  <p class="section-lead">הלוגו הוא החתימה הוויזואלית שלנו. הוא מופיע על כל מודעה, חשבונית, אריזה, ובכל מקום שאנחנו פוגשים את הקהל. כל וריאנט נועד לקונטקסט אחר — אבל כולם מספרים את אותו הסיפור.</p>
  ${logoVariantsHtml}
  ${logo.minClearSpaceRatio ? `<p style="margin-top:16px;color:#6B7280;font-size:0.86rem">מרווח חופשי מינימלי: ${logo.minClearSpaceRatio}× גובה האותיות. גודל מינימלי לקריאה: ${logo.minRenderSizePx || 32}px.</p>` : ''}
</div>
` : ''}

${colors ? `
<!-- ═══ COLORS ═══ -->
<div class="page" id="colors">
  <h2>שלב 5</h2>
  <h1 class="section-title">הצבעים שלנו</h1>
  <p class="section-lead">${esc(colorStory)}</p>
  ${colorPaletteHtml}
  ${colors.usageRules?.length ? `
  <h4>כללי שימוש</h4>
  <ul style="background:#F9FAFB;border-radius:8px;padding:18px 28px;font-size:0.94rem">${colors.usageRules.map(r => `<li>${esc(r)}</li>`).join('')}</ul>
  ` : ''}
</div>
` : ''}

${visual.typography ? `
<!-- ═══ TYPOGRAPHY ═══ -->
<div class="page" id="typography">
  <h2>שלב 6</h2>
  <h1 class="section-title">הטיפוגרפיה</h1>
  <p class="section-lead">הגופן הוא הקול הוויזואלי שלנו. הוא קובע אם אנחנו נתפסים כרציניים או חמים, מודרניים או מסורתיים, מקצועיים או ידידותיים.</p>

  ${visual.typography.primaryFontHe ? `
  <div class="typography-sample" style="font-family: '${esc(fontHe)}', 'Arial Hebrew', sans-serif">
    <div class="type-meta">גופן עברי ראשי · ${esc(fontHe)}</div>
    <div class="type-sample-1">${esc(tagline || businessName || 'שלום, אנחנו כאן')}</div>
    <div class="type-sample-2">${esc(messaging?.elevatorPitch?.he?.slice(0, 90) || mission || 'הקול שלנו — חמים, מקצועי, ללא מילים מיותרות')}</div>
    <div class="type-sample-3">פסקת טקסט רגילה — כך זה ייראה באתר, באימיילים, בפוסטים ובקופי הפרסומי. הקריאות, הקצב והרווחים חשובים בדיוק כמו תוכן המילים עצמן.</div>
  </div>
  ` : ''}
  ${visual.typography.primaryFontEn && (ident.businessName?.en || ident.tagline?.en || ident.mission?.en) ? `
  <div class="typography-sample" style="font-family: '${esc(fontEn)}', system-ui, sans-serif; direction: ltr; text-align: left">
    <div class="type-meta" style="text-align:left">גופן אנגלי משני · ${esc(fontEn)}</div>
    <div class="type-sample-1">${esc(ident.tagline?.en || ident.businessName?.en || 'Hello.')}</div>
    <div class="type-sample-2">${esc(messaging?.elevatorPitch?.en?.slice(0, 90) || ident.mission?.en || 'Our voice — warm, professional, no clutter.')}</div>
    <div class="type-sample-3">${esc(messaging?.boilerplate?.en?.slice(0, 200) || 'Standard paragraph — this is how copy will appear across digital assets. Readability and rhythm matter just as much as the words.')}</div>
  </div>
  ` : ''}
</div>
` : ''}

${voice ? `
<!-- ═══ VOICE ═══ -->
<div class="page" id="voice">
  <h2>שלב 7</h2>
  <h1 class="section-title">איך אנחנו מדברים</h1>
  <p class="section-lead">המילים שאנחנו בוחרים, הקצב, הטון — כולם מעצבים את התחושה שלקוח מקבל בכל מגע איתנו. זה לא מקרי — זה תוכנית.</p>

  ${voice.toneSummary ? `<div class="voice-summary">${esc(voice.toneSummary.he || voice.toneSummary.en)}</div>` : ''}

  ${voice.principles?.length ? `
  <h3>העקרונות שלנו</h3>
  <ol class="voice-principles">${voice.principles.map(p => `<li>${esc(p)}</li>`).join('')}</ol>
  ` : ''}

  ${doDontHtml}
  ${voiceInActionHtml}
</div>
` : ''}

${voice?.vocabulary ? `
<!-- ═══ VOCABULARY ═══ -->
<div class="page" id="vocabulary">
  <h2>שלב 8</h2>
  <h1 class="section-title">המילון שלנו</h1>
  <p class="section-lead">המילים האלה נוצרו לזכור — או להימנע מהן. הן מה שמבדיל אותנו מהמתחרים.</p>
  ${vocabHtml}
</div>
` : ''}

${messaging ? `
<!-- ═══ MESSAGING ═══ -->
<div class="page" id="messaging">
  <h2>שלב 9</h2>
  <h1 class="section-title">איך אנחנו מציגים את עצמנו</h1>
  <p class="section-lead">בכל פגישה, באתר, באימייל — אלה הניסוחים הקנוניים שאנחנו חוזרים אליהם.</p>

  ${messaging.elevatorPitch ? `
  <h3>אליבטור פיץ' (30 שניות)</h3>
  <div class="manifesto" style="font-size:1.04rem">${esc(messaging.elevatorPitch.he || messaging.elevatorPitch.en)}</div>
  ` : ''}

  ${messaging.boilerplate ? `
  <h3>פסקת About אחת (boilerplate)</h3>
  <div class="manifesto" style="font-size:1rem">${esc(messaging.boilerplate.he || messaging.boilerplate.en)}</div>
  ` : ''}

  ${messaging.proofPoints?.length ? `
  <h3>נקודות הוכחה</h3>
  <ul style="background:#F9FAFB;border-radius:8px;padding:20px 28px;font-size:1rem;line-height:1.8">${messaging.proofPoints.map(p => `<li>${esc(p)}</li>`).join('')}</ul>
  ` : ''}

  ${messaging.callsToAction ? `
  <h3>קריאות לפעולה</h3>
  ${messaging.callsToAction.warm?.length ? `<p><strong>חמות:</strong> ${messaging.callsToAction.warm.map((c: any) => `"${esc(c.he || c.en)}"`).join(' · ')}</p>` : ''}
  ${messaging.callsToAction.urgent?.length ? `<p><strong>דחופות:</strong> ${messaging.callsToAction.urgent.map((c: any) => `"${esc(c.he || c.en)}"`).join(' · ')}</p>` : ''}
  ${messaging.callsToAction.soft?.length ? `<p><strong>רכות:</strong> ${messaging.callsToAction.soft.map((c: any) => `"${esc(c.he || c.en)}"`).join(' · ')}</p>` : ''}
  ` : ''}
</div>
` : ''}

${personas.length ? `
<!-- ═══ AUDIENCE ═══ -->
<div class="page" id="audience">
  <h2>שלב 10</h2>
  <h1 class="section-title">הקהל שלנו</h1>
  <p class="section-lead">אנחנו לא מדברים אל "כולם". אנחנו מדברים אל אנשים ספציפיים, עם חיים, חששות, וחלומות. אלה הם.</p>
  ${personasHtml}
</div>
` : ''}

${auditSignalHtml ? `
<!-- ═══ DATA ═══ -->
<div class="page" id="data">
  <h2>שלב 11</h2>
  <h1 class="section-title">מה הנתונים אומרים</h1>
  <p class="section-lead">המספרים האלה לא מחליפים את האינטואיציה — הם מאשרים אותה. כך נראה הביצוע שלנו במציאות.</p>
  ${auditSignalHtml}
</div>
` : ''}

${compliance?.disclaimers?.length ? `
<!-- ═══ COMPLIANCE ═══ -->
<div class="page" id="compliance">
  <h2>שלב 12</h2>
  <h1 class="section-title">הסתייגויות חוקיות</h1>
  <p class="section-lead">לכל מודעה, באתר, ובכל הצעת מחיר — חובה להופיע ההסתייגויות הבאות:</p>
  <ul style="background:#FEF2F2;border:1px solid #FCA5A5;border-radius:8px;padding:18px 28px;line-height:1.9">
    ${compliance.disclaimers.map((d: any) => `<li>${esc(d.he || d.en)}</li>`).join('')}
  </ul>
</div>
` : ''}

<div class="footer">
  ${esc(businessName)} · Brand Book v${book.version} · ${book.status === 'approved' ? 'מאושר' : (book.status === 'draft' ? 'טיוטה' : esc(book.status))} · ${new Date().toLocaleDateString('he-IL', { day: '2-digit', month: 'long', year: 'numeric' })}<br>
  המסמך הזה הוא רכוש פנימי של ${esc(businessName)}. שימוש חיצוני מחייב אישור.
</div>

</body>
</html>`
}

/**
 * Manifest of all binary assets in the brand book — used by frontend to
 * download + bundle into a single ZIP via JSZip (zero server-side ZIP deps).
 */
export function getBrandAssetManifest(book: BrandBookV2): { items: Array<{ url: string; category: string; filename: string }> } {
    const items: Array<{ url: string; category: string; filename: string }> = []
    const logo = book.visual?.logo
    if (logo?.primary?.url) items.push({ url: logo.primary.url, category: 'logo', filename: 'logo-primary.png' })
    if (logo?.icon?.url) items.push({ url: logo.icon.url, category: 'logo', filename: 'logo-icon.png' })
    if (logo?.monochromeBlack?.url) items.push({ url: logo.monochromeBlack.url, category: 'logo', filename: 'logo-mono-black.png' })
    if (logo?.monochromeWhite?.url) items.push({ url: logo.monochromeWhite.url, category: 'logo', filename: 'logo-mono-white.png' })
    if (logo?.favicon?.url) items.push({ url: logo.favicon.url, category: 'logo', filename: 'favicon.png' })
    if (logo?.socialAvatar?.url) items.push({ url: logo.socialAvatar.url, category: 'logo', filename: 'social-avatar.png' })
    if (logo?.horizontal?.url) items.push({ url: logo.horizontal.url, category: 'logo', filename: 'logo-horizontal.png' })
    if (logo?.vertical?.url) items.push({ url: logo.vertical.url, category: 'logo', filename: 'logo-vertical.png' })

    const patterns = book.visual?.patterns?.items || []
    for (let i = 0; i < patterns.length; i++) {
        if (patterns[i].url) items.push({ url: patterns[i].url, category: 'patterns', filename: `pattern-${i + 1}.png` })
    }
    const imageryRefs = book.visual?.imagery?.referenceUrls || []
    for (let i = 0; i < imageryRefs.length; i++) {
        items.push({ url: imageryRefs[i], category: 'imagery', filename: `reference-${i + 1}.png` })
    }
    for (let i = 0; i < (book.audience?.personas?.items || []).length; i++) {
        const p = book.audience!.personas!.items[i]
        if (p.avatarUrl) items.push({ url: p.avatarUrl, category: 'personas', filename: `persona-${p.id || i}.png` })
    }
    return { items }
}
