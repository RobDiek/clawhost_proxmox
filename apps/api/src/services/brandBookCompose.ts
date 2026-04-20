/**
 * Brand Book Composer Service
 *
 * Combines all available signals into a full brand_book draft:
 *   1. Research data (positioning, personas, competitors from Stage 1-5)
 *   2. Scraped website signals (brandExtract output)
 *   3. Logo analysis (logoAnalyze output)
 *   4. User-provided fields (name, tagline)
 *
 * Uses Claude Sonnet for synthesis — this is the reasoning job where
 * multiple signals must be reconciled (e.g. scraped #FFFFFF dominance
 * vs research-positioning "premium brand" → mekhayev should recommend
 * darker primary despite white dominance).
 *
 * Returns: { draft: BrandBookDraft, gaps: Array<{ priority, field, suggestion }> }
 *
 * Gaps power the onboarding UI — critical gaps block, important gaps prompt.
 */

import type { ExtractedBrandSignals } from './brandExtract'

// Lightweight shape-only import (we use it as "any" to avoid circular coupling)
type LogoAnalysis = {
    ok: boolean
    source: { url: string; format: string; sizeBytes: number; isDataUri: boolean }
    visual: {
        style: string
        description: string
        descriptionHe: string
        hasText: boolean
        dominantColors: string[]
        hasTransparentBackground: boolean
        inferredDimensions: { width: number; height: number } | null
        aspectRatio: string | null
    }
    usageRules: {
        minSizePx: number
        safeZonePx: number
        allowedBackgrounds: string[]
        forbiddenContexts: string[]
        recommendedVariants: string[]
    }
    composition: {
        defaultPosition: string
        opacity: number
        requiresLightBackground: boolean
        requiresDarkBackground: boolean
    }
}

// Research data shape — subset from stages 1-5
export interface ResearchSummary {
    businessName?: string
    positioning?: string              // stage 3
    personas?: Array<{ name: string; description?: string; jtbd?: string }>  // stage 4
    competitors?: Array<{ name: string; url?: string }>  // stage 2
    industry?: string
    targetMarket?: string              // "IL SMB", "Global B2B", etc.
}

// User-provided direct inputs (from onboarding form)
export interface UserBrandInputs {
    businessName?: string
    taglineHe?: string
    taglineEn?: string
    vibePreset?: 'premium' | 'approachable' | 'technical' | 'playful' | 'trustworthy'
    primaryColorOverride?: string     // user explicitly picked a color
    hebrewFontPreference?: 'Rubik' | 'Heebo' | 'Assistant'
    feedback?: string                 // Tier 2-S: user-provided feedback for regenerate pass
    skipEnglish?: boolean             // Tier 2-M: opt out of bilingual output
}

export interface BrandBookDraft {
    identity: {
        businessName: string | null
        legalName: string | null
        taglineHe: string | null
        taglineEn: string | null
        missionHe: string | null
        missionEn: string | null
        manifestoHe: string | null
        positioningLine: string | null
    }
    logo: {
        primary: { url: string | null; format: string | null; transparentBg: boolean } | null
        usageRules: LogoAnalysis['usageRules'] | null
        style: string | null
        aiGenerated: boolean
        sourceFiles: Array<{ type: string; url: string }>
    }
    colors: {
        primary: { hex: string; name: string; usage: string } | null
        secondary: { hex: string; name: string; usage: string } | null
        accent: Array<{ hex: string; name: string }>
        neutrals: Array<{ hex: string; name: string }>
        semantic: { success: string; warning: string; danger: string; info: string }
        palette: string[]
    }
    typography: {
        heading: { family: string; weights: number[]; license: string } | null
        body: { family: string; weights: number[]; license: string } | null
        hebrewSupport: { headingFamily: string; bodyFamily: string } | null
        rules: { lineHeight: number; letterSpacing: number }
    }
    imagery: {
        photographyStyle: { primary: string; lightingPreference: string }
        illustrationStyle: { present: boolean; style: string | null }
        moodKeywords: string[]
        doNotUse: string[]
    }
    voice: {
        tone: string
        personalityAdjectives: string[]
        vocabularyDo: string[]
        vocabularyDont: string[]
        signaturePhrases: string[]
        hebrewRegister: string
        humor: string
    }
    components: {
        iconSet: string
        shapes: { cornerRadius: string; borderStyle: string }
    }
    principles: string[]                 // brand constitution rules
    compliance: { aiGeneratedDisclosure: boolean; trademarkRegistered: boolean }
}

export interface Gap {
    priority: 'critical' | 'important' | 'nice_to_have'
    field: string
    suggestion: string        // Hebrew
    canAutoGenerate: boolean  // will M2 logo-gen help?
}

export interface RationaleSections {
    overall?: string
    colors?: string
    typography?: string
    voice?: string
    identity?: string
}

export interface ComposedBrandBook {
    draft: BrandBookDraft
    gaps: Gap[]
    rationale: RationaleSections | string   // structured sections (Tier 2-O), string kept for backcompat
    confidence: 'high' | 'medium' | 'low'
    confidenceReasons: string[]              // Tier 2-T: explain the confidence score
    sources: {
        scrapedFrom?: string
        logoAnalyzedFrom?: string
        researchStagesUsed: number[]
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// Main compose function
// ═══════════════════════════════════════════════════════════════════════════

export async function composeBrandBook(params: {
    scraped?: ExtractedBrandSignals | null
    logoAnalysis?: LogoAnalysis | null
    research?: ResearchSummary | null
    userInputs?: UserBrandInputs | null
    anthropicKey: string
}): Promise<ComposedBrandBook> {
    const { scraped, logoAnalysis, research, userInputs, anthropicKey } = params

    const prompt = buildComposerPrompt({ scraped, logoAnalysis, research, userInputs })

    const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': anthropicKey,
            'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
            model: 'claude-sonnet-4-6',
            max_tokens: 6000,
            messages: [{ role: 'user', content: prompt }],
        }),
    })

    if (!res.ok) {
        const errText = await res.text()
        throw new Error(`Composer Claude HTTP ${res.status}: ${errText.substring(0, 300)}`)
    }

    const data = await res.json() as { content?: Array<{ text: string }> }
    const text = data.content?.[0]?.text || ''

    // Extract JSON
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('Composer returned no JSON')

    let parsed: {
        draft: BrandBookDraft
        gaps: Gap[]
        rationale: RationaleSections | string
        confidence: 'high' | 'medium' | 'low'
        confidenceReasons?: string[]
    }
    try {
        parsed = JSON.parse(jsonMatch[0])
    } catch (err) {
        throw new Error('Composer JSON parse failed: ' + text.substring(0, 300))
    }

    // Wire up post-LLM enrichment: inject logoAnalysis into draft.logo
    if (logoAnalysis?.ok && parsed.draft.logo) {
        parsed.draft.logo.primary = {
            url: logoAnalysis.source.url,
            format: logoAnalysis.source.format,
            transparentBg: logoAnalysis.visual.hasTransparentBackground,
        }
        parsed.draft.logo.usageRules = logoAnalysis.usageRules
        parsed.draft.logo.style = logoAnalysis.visual.style
    }

    // Validate + auto-detect missing gaps (safety net if LLM didn't flag)
    const computedGaps = detectGaps(parsed.draft, logoAnalysis)
    const mergedGaps = mergeGaps(parsed.gaps || [], computedGaps)

    return {
        draft: parsed.draft,
        gaps: mergedGaps,
        rationale: parsed.rationale || '',
        confidence: parsed.confidence || 'medium',
        confidenceReasons: parsed.confidenceReasons || [],
        sources: {
            scrapedFrom: scraped?.url,
            logoAnalyzedFrom: logoAnalysis?.source.url,
            researchStagesUsed: research ? [1, 2, 3, 4, 5] : [],
        },
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// Prompt builder
// ═══════════════════════════════════════════════════════════════════════════

function buildComposerPrompt(params: {
    scraped?: ExtractedBrandSignals | null
    logoAnalysis?: LogoAnalysis | null
    research?: ResearchSummary | null
    userInputs?: UserBrandInputs | null
}): string {
    const { scraped, logoAnalysis, research, userInputs } = params

    let prompt = `אתה מעצב מותג בכיר ("mekhayev") בפלטפורמת ClawFlow. תפקידך — ליצור brand book מלא ועקבי לעסק.

## קהל היעד של הפלט שלך
בעל העסק עצמו קורא את rationale + gaps + confidenceReasons — **הוא לא מעצב ולא איש שיווק**. כתוב בעברית פשוטה וברורה.

## כללי שפה חובה בכל שדות הטקסט (rationale, gaps.suggestion, confidenceReasons)
- **עברית קודם, אנגלית רק אם אין ברירה.** מונחים מקצועיים לטיניים חייבים לבוא עם הבהרה קצרה בסוגריים בפעם הראשונה:
  - "כפתור קריאה לפעולה (CTA)" — לא סתם "CTA"
  - "קובץ ווקטורי (SVG)" — לא סתם "SVG"
  - "פורמט תמונה עם שקיפות (PNG)" — לא סתם "PNG"
  - "הצבע הראשי (primary)" — לא סתם "primary color"
  - "קוד צבע הקסדצימלי (HEX)" — לא סתם "HEX"
  - "רקע כהה (dark background)" → "רקע כהה"
  - "גודל מינימלי" → "גודל מינימלי", לא "minimum size"
- **תיקונים בעברית**: כשאתה מתאר תיקון שנעשה, אל תכלול נתיב JSON (כמו \`voice.vocabularyDo[2]\` או \`gaps[0].suggestion\`) — אלו פריטים פנימיים של המערכת, לא של המשתמש. תאר במילים: "במילון הניב שלך" / "בהמלצה על השלמת פערים".
- **אין anglicisms בלתי מוסברים** — "vibe", "dominance", "trustworthy vibe", "Hebrew-first", "placeholder" — כל אחד חייב גלוס עברי בסוגריים: "טון אמין (trustworthy vibe)", "דומיננטיות חזותית (dominance)", "עברית-ראשית (Hebrew-first)", "ממלא מקום זמני (placeholder)".
- **אל תכתוב "אני נבנה"/"אשתמש ב"/"בואו נראה"** — רק תוצאה וסיבה.

## קלט זמין:
`

    // Research context
    if (research) {
        prompt += '\n\n## מחקר שוק (שלבים 1-5)\n'
        if (research.businessName) prompt += `- שם עסק: ${research.businessName}\n`
        if (research.industry) prompt += `- ענף: ${research.industry}\n`
        if (research.targetMarket) prompt += `- שוק יעד: ${research.targetMarket}\n`
        if (research.positioning) prompt += `- מיצוב: ${research.positioning}\n`
        if (research.personas?.length) {
            prompt += '- פרסונות:\n'
            research.personas.slice(0, 3).forEach(p => {
                prompt += `  • ${p.name}${p.jtbd ? ` — JTBD: ${p.jtbd}` : ''}\n`
            })
        }
        if (research.competitors?.length) {
            prompt += `- מתחרים: ${research.competitors.slice(0, 5).map(c => c.name).join(', ')}\n`
        }
    }

    // Scraped signals
    if (scraped) {
        prompt += '\n\n## סיגנלים מהאתר (scraped)\n'
        if (scraped.identity.businessName) prompt += `- שם (og:site_name): ${scraped.identity.businessName}\n`
        if (scraped.identity.description) prompt += `- תיאור: ${scraped.identity.description}\n`
        if (scraped.identity.language) prompt += `- שפה: ${scraped.identity.language} (${scraped.identity.direction})\n`
        if (scraped.colors.top.length) prompt += `- צבעים מובילים (by frequency): ${scraped.colors.top.join(', ')}\n`
        if (scraped.typography.googleFonts.length) prompt += `- Google Fonts: ${scraped.typography.googleFonts.join(', ')}\n`
        if (scraped.typography.fontFamilies.length) prompt += `- Font families: ${scraped.typography.fontFamilies.slice(0, 5).map(f => f.family).join(', ')}\n`
        if (scraped.typography.hebrewFonts.length) prompt += `- Hebrew fonts: ${scraped.typography.hebrewFonts.join(', ')}\n`
        if (scraped.copy.headings.length) prompt += `- Headings דוגמאות: ${scraped.copy.headings.slice(0, 3).map(h => `"${h}"`).join(' | ')}\n`
        if (scraped.copy.ctas.length) prompt += `- CTAs דוגמאות: ${scraped.copy.ctas.slice(0, 5).join(' | ')}\n`
        if (scraped.copy.heroParagraphs[0]) prompt += `- Hero paragraph: "${scraped.copy.heroParagraphs[0].substring(0, 200)}"\n`
        if (scraped.media.themeColor) prompt += `- theme-color: ${scraped.media.themeColor}\n`
    }

    // Logo analysis
    if (logoAnalysis?.ok) {
        prompt += '\n\n## ניתוח לוגו\n'
        prompt += `- URL: ${logoAnalysis.source.url.substring(0, 100)}${logoAnalysis.source.url.length > 100 ? '...' : ''}\n`
        prompt += `- Format: ${logoAnalysis.source.format}\n`
        prompt += `- Style: ${logoAnalysis.visual.style}\n`
        prompt += `- Description: ${logoAnalysis.visual.descriptionHe}\n`
        if (logoAnalysis.visual.dominantColors.length) {
            prompt += `- Logo colors: ${logoAnalysis.visual.dominantColors.join(', ')}\n`
        }
        prompt += `- Transparent bg: ${logoAnalysis.visual.hasTransparentBackground}\n`
        if (logoAnalysis.visual.aspectRatio) prompt += `- Aspect: ${logoAnalysis.visual.aspectRatio}\n`
    }

    // User inputs
    if (userInputs) {
        prompt += '\n\n## קלט ממשתמש\n'
        if (userInputs.businessName) prompt += `- שם עסק: ${userInputs.businessName}\n`
        if (userInputs.taglineHe) prompt += `- Tagline (HE): ${userInputs.taglineHe}\n`
        if (userInputs.taglineEn) prompt += `- Tagline (EN): ${userInputs.taglineEn}\n`
        if (userInputs.vibePreset) {
            const vibeMeaning = {
                premium: 'יוקרתי — עושר, מומחיות, אמינות גבוהה',
                approachable: 'ידידותי — חם, נגיש, אנושי',
                technical: 'טכני — מדויק, דאטה-דריבן, מודרני',
                playful: 'שובב — חדשני, צבעוני, משוחרר',
                trustworthy: 'אמין — סולידי, שמרני, מקצועי',
            }[userInputs.vibePreset]
            prompt += `- Vibe: ${userInputs.vibePreset} (${vibeMeaning})\n`
        }
        if (userInputs.primaryColorOverride) prompt += `- Primary color (user picked): ${userInputs.primaryColorOverride}\n`
        if (userInputs.hebrewFontPreference) prompt += `- Hebrew font: ${userInputs.hebrewFontPreference}\n`
        if (userInputs.skipEnglish) prompt += `- skipEnglish: true (do NOT generate *En fields)\n`
        if (userInputs.feedback && userInputs.feedback.trim()) {
            prompt += `\n## 🔁 משוב מהמשתמש — גרסה חדשה\nהמשתמש ראה טיוטה קודמת וביקש את השינויים הבאים:\n\n> ${userInputs.feedback.trim()}\n\n**חובה לפעול לפי המשוב.** אם המשוב נוגד עקרון אחר — תן עדיפות למשוב ותיעד ב-rationale.overall.\n`
        }
    }

    prompt += `

**משימה:**
החזר JSON יחיד בלי markdown fence, בלי טקסט נוסף, עם המבנה הבא:

\`\`\`
{
  "draft": {
    "identity": {
      "businessName": "...",
      "legalName": null,
      "taglineHe":       "עד 60 תווים, בעברית — מסר רגשי/מכירתי",
      "taglineEn":       "English up to 60 chars — natural, not literal translation",
      "missionHe":       "2-3 משפטים על המטרה של העסק",
      "missionEn":       "2-3 English sentences — mission",
      "manifestoHe":     "3-4 משפטים של brand manifesto — קצת יותר עמוק ממטרה",
      "positioningLine": "משפט מיצוב אחד בעברית — 'לא X, לא Y — אלא Z' (חייב לנקוב בקטגוריה שמוחלפת)"
    },
    "logo": {
      "primary": null,  // נמלא אוטומטית מ-logoAnalysis
      "usageRules": null,
      "style": null,
      "aiGenerated": false,
      "sourceFiles": []
    },
    "colors": {
      "primary":         { "hex": "#RRGGBB", "name": "שם הצבע בעברית", "usage": "מתי להשתמש" },
      "secondary":       { "hex": "#RRGGBB", "name": "...", "usage": "..." },
      "accent":          [{ "hex": "#RRGGBB", "name": "..." }],
      "neutrals":        [{ "hex": "#F3F4F6", "name": "אפור בהיר" }, ...],  // grayscale only R≈G≈B
      "semantic":        { "success": "#10B981", "warning": "#F59E0B", "danger": "#EF4444", "info": "#3B82F6" },
      "palette":         ["#RRGGBB", ...],         // brand colors only (primary/secondary/accent hex), up to 5, priority order
      "paletteExtended": ["#F0FDF4", "#BBF7D0"]    // brand tints — tinted variations, up to 6
    },
    "typography": {
      "heading": { "family": "Rubik", "weights": [500, 700, 900], "license": "Google Fonts (OFL)" },
      "body":    { "family": "Heebo", "weights": [400, 500], "license": "Google Fonts (OFL)" },
      "hebrewSupport": { "headingFamily": "Rubik", "bodyFamily": "Heebo" },
      "rules": { "lineHeight": 1.5, "letterSpacing": 0 }
    },
    "imagery": {
      "photographyStyle": { "primary": "lifestyle|editorial|product|minimal|dramatic", "lightingPreference": "natural|studio|moody" },
      "illustrationStyle": { "present": true, "style": "flat|3d|hand-drawn|geometric|null" },
      "moodKeywords": ["5-8 מילים — bright, warm, מקצועי, צעיר, ..."],
      "doNotUse": ["stock photos גנריים", "אנשים בחליפות", "..."]
    },
    "voice": {
      "tone": "professional|casual|authoritative|intimate|mixed",
      "personalityAdjectives": ["5 מילים — ישיר, חם, מקצועי, ..."],
      "vocabularyDo": ["מילים שמייצגות את הבראנד — עד 8"],
      "vocabularyDont": ["מילים שהבראנד לא משתמש בהן — עד 5"],
      "signaturePhrases": ["2-4 catchphrases אם יש"],
      "hebrewRegister": "formal|casual|mixed",
      "humor": "none|subtle|moderate|core"
    },
    "components": {
      "iconSet": "lucide|heroicons|phosphor",
      "shapes": { "cornerRadius": "none|small|medium|large|full", "borderStyle": "solid|soft|none" }
    },
    "principles": [
      "עקרונות brand constitution — 3-5 חוקים שאי אפשר לשבור",
      "דוגמה: לעולם לא fear-based marketing",
      "דוגמה: תמיד להתחיל בעברית"
    ],
    "compliance": { "aiGeneratedDisclosure": false, "trademarkRegistered": false }
  },
  "gaps": [
    { "priority": "critical|important|nice_to_have", "field": "logo.primary", "suggestion": "בעברית — מה חסר ומה הפתרון", "canAutoGenerate": true|false }
  ],
  "rationale": {
    "overall":    "סיכום של 2-3 משפטים בעברית — החלטות מרכזיות + סתירות שנפתרו",
    "colors":     "הסבר ספציפי לבחירת primary/secondary — מדוע הצבעים הנוכחיים ולא אחרים",
    "typography": "הסבר לבחירת הגופן וה-weights — תוך שמירת העדפת המשתמש אם יש",
    "voice":      "הסבר לטון ולרגיסטר — קישור ל-persona + positioning",
    "identity":   "הסבר ל-tagline + positioning — מה נאמר במפורש ומה נרמז"
  },
  "confidence":        "high | medium | low",
  "confidenceReasons": [
    "פירוט למה ביטחון הוא הרמה הזו — 2-4 נקודות קונקרטיות",
    "למשל: 'logo file contains text POWER — mismatch with businessName suggests outdated/placeholder'",
    "למשל: 'scraped palette had 7 strong colors — consistency high'"
  ]
}
\`\`\`

**כללי זהב:**
1. **עברית קודם** — כל שדה "*He" חייב להיות בעברית נכונה. שדות "*En" באנגלית טבעית.

2. **Hebrew grammar strict** — אל תמציא מילים. אם אתה לא בטוח במילה עברית (נטייה, שורש, הטיה) — השתמש במילה פשוטה יותר שאתה מכיר. מילה שאינה קיימת יותר גרועה ממילה פשוטה.

    **🚫 רשימת hallucinations נצפו בגרסאות קודמות — לעולם אל תשתמש:**
    - **"לבריח"** — לא קיים. השתמש ב-"לברוח" (לברוח מדבר מה) או "להבריח" (contraband, נדיר).
    - **"מתסכן"** — לא תקין. "מסתכן" (מסכן את עצמו) או "מסוכן".
    - **"מתקדם"** — תקין רק אם פועל (advances), לא כשם תואר לטכנולוגיה. ל-"advanced tech" עדיף "מתקדמת" (נקבה) או "חדשנית".

    **לפני כל מילה עברית לא-טריוויאלית שאל את עצמך:** "האם המילה הזו קיימת באיות הזה בעברית מודרנית?" אם יש ספק ולו הקטן ביותר — בחר מילה פשוטה יותר.

3. **Hebrew fonts חובה** — typography.hebrewSupport חייב להיות מלא. Rubik/Heebo/Assistant קבילים.

4. **Respect user font preference** — אם userInputs.hebrewFontPreference מוגדר:
   - השתמש בו גם ל-heading וגם ל-body (לא תציע גופן אחר ב-gaps).
   - להבדל בין heading ל-body: weight + size, לא family.
   - heading: weights [700, 800, 900] · body: weights [400, 500].
   - בונוס: אם user בחר Heebo — הוסף גופן fallback ל-accent (Rubik למספרים/quotes) ב-typography.accent.

5. **Semantic colors ≠ brand colors (CRITICAL)** — semantic (success/warning/danger/info) חייב להיות שונה מ-primary/secondary/accent של המותג.
   - ברירת מחדל בטוחה: success=#10B981, warning=#F59E0B, danger=#EF4444, info=#3B82F6
   - החלף רק אם יש קונפליקט נגישות עם primary (contrast < 3.0)
   - **אל תשתמש באותו hex ל-semantic.success וגם ל-primary** — זה גורם לבלבול UX (כפתור "אישור" זהה חזותית ל-CTA).

6. **Neutrals = grayscale בלבד** — neutrals[] חייב להיות בטווח אפור (R≈G≈B ± 10). גוונים בעלי גוון (כמו #BBF7D0 ירקרק או #FEF3C7 צהבהב) הם brand tints ↓
   - → מקומם: palette.extended (רשימה נוספת לגוונים מלוכלכים) או accent[]. לא neutrals.

7. **Research trumps scraping** — אם scraped signals סותרים research positioning, תן עדיפות ל-research. הסבר ב-rationale.

8. **Gaps honest + consistent** — סמן critical gap אם logo.primary חסר, או primary color חסר, או heading font חסר.
   - **ALIGNMENT:** אל תסמן gap על בחירה שהמשתמש ביקש (למשל אם user בחר Heebo, אל תסמן "consider Rubik").

9. **Positioning ≠ Tagline** — שני דברים שונים:
   - Tagline: 3-7 מילים, מסר רגשי, מכירתי (למשל "AI לעסקים — פשוט, בעברית").
   - Positioning: מגדיר טריטוריה תחרותית — "לא X, לא Y — אלא Z". חייב לנקוב בקטגוריה שמוחלפת (לא "עוד blog", לא "עוד כלי", וכו').

10. **Signature phrases ≠ CTA copy** — signaturePhrases הן הצהרות מותג (שברי manifesto), לא טקסט כפתור. **לעולם אל תעתיק משפטים מ-scraped.copy.ctas.**

11. **Mood keywords באיות עברית** — למשל "חם", "מקצועי", לא "warm" או "professional". **אל תכלול מילים שהן cultural identifiers** (כמו "ישראלי") — אלו שייכים לקונטקסט, לא למצב-רוח.

12. **Principles ספציפיים** — לא generic ("להיות טוב"). נובעים מ-research + personas. **כל principle חייב להיות אכיף ברמת תוכן** (אפשר לומר "נכשל" או "עובר" לדוגמה קונקרטית).

13. **Colors accessibility** — primary מול semantic.info חייב contrast ≥ 3.0. אם קונפליקט — העדף שמירת primary ושינוי semantic.info.

14. **Vibe consistency** — אם vibePreset=playful, tone לא יהיה authoritative. עקביות מלאה.

15. **Bilingual output חובה (אלא אם כן skipEnglish)** — לכל שדה *He מלא ממולא, גם *En חייב להיות ממולא באנגלית טבעית (לא תרגום מילולי — נוסח שיעבוד ב-LinkedIn outreach באנגלית, ב-Google Ads EN, וכו').
    שדות שחייבים תרגום: taglineHe↔taglineEn, missionHe↔missionEn.
    manifestoHe רשאי להישאר רק בעברית (אורך גדול, פחות שימושי באנגלית — אבל אם יש placeholder אנגלי טוב, תן).

16. **Vibe-driven components + shapes (קביעה אוטומטית):**
    - vibePreset=premium      → iconSet=heroicons,  cornerRadius=small (4px),  borderStyle=solid
    - vibePreset=approachable → iconSet=lucide,     cornerRadius=medium (8px), borderStyle=soft
    - vibePreset=technical    → iconSet=phosphor,   cornerRadius=small (4px),  borderStyle=solid
    - vibePreset=playful      → iconSet=lucide,     cornerRadius=full (24px),  borderStyle=soft
    - vibePreset=trustworthy  → iconSet=heroicons,  cornerRadius=small (4px),  borderStyle=solid

17. **Palette structure (שמירה על סדר):**
    - "palette" = רשימת צבעי המותג בסדר חשיבות (primary/secondary/accent hex בלבד, עד 5)
    - "paletteExtended" = brand tints (וריאציות בהירות/כהות של primary, כמו #F0FDF4 שהוא tint בהיר של ירוק #166534)
      אל תערבב אותם ב-palette ואל תשים אותם ב-neutrals.

18. **JSON תקף** — ללא comments, ללא trailing commas, ללא markdown.

19. **User-facing text בעברית נגישה** — rationale.*, gaps[].suggestion, confidenceReasons[] קריאים ע"י בעל העסק (לא מעצב). כל מונח מקצועי באנגלית = הבהרה עברית בסוגריים בפעם הראשונה (CTA, SVG, PNG, primary, HEX, dark background, placeholder וכו'). **אסור** נתיבי JSON בטקסט (כמו "voice.vocabularyDo[2]"). אסור anglicisms לא-מוסברים ("vibe", "dominance", "trustworthy vibe", "Hebrew-first").`

    return prompt
}

// ═══════════════════════════════════════════════════════════════════════════
// Gap detection (safety net if LLM didn't flag)
// ═══════════════════════════════════════════════════════════════════════════

function detectGaps(draft: BrandBookDraft, logoAnalysis?: LogoAnalysis | null): Gap[] {
    const gaps: Gap[] = []

    if (!draft.identity.businessName) {
        gaps.push({
            priority: 'critical',
            field: 'identity.businessName',
            suggestion: 'שם עסק חסר — הזן שם באונבורדינג',
            canAutoGenerate: false,
        })
    }

    if (!draft.logo.primary?.url || !logoAnalysis?.ok) {
        gaps.push({
            priority: 'critical',
            field: 'logo.primary',
            suggestion: 'לוגו חסר או לא מנותח — העלה קובץ לוגו או צרנו קונספט',
            canAutoGenerate: true,   // Phase B3 will offer AI logo generation
        })
    }

    // Logo text mismatch: if logoAnalysis detected text that doesn't match businessName,
    // the file might be a placeholder or outdated. Surface as critical, not buried in rationale.
    // Fires when Claude Vision's description/OCR mentions a different brand name in the logo.
    if (logoAnalysis?.ok && logoAnalysis.visual.hasText && draft.identity.businessName) {
        const businessLower = draft.identity.businessName.toLowerCase().split(/[\s—|·:•]/)[0]
        const desc = (logoAnalysis.visual.description || '').toLowerCase()
        const descHe = (logoAnalysis.visual.descriptionHe || '').toLowerCase()

        // Extract quoted strings from description (e.g. "logo shows 'POWER'" → "POWER")
        const quotedMatches = [...`${desc} ${descHe}`.matchAll(/["'"״״]([A-Za-zא-ת][\w\s-]{1,40}?)["'"״״]/g)]
        const quotedTexts = quotedMatches.map(m => m[1].trim().toLowerCase()).filter(Boolean)

        // Also check unquoted capitalized words — less reliable but catches "the logo reads POWER"
        const capitalWords = [...desc.matchAll(/\b([A-Z]{3,}[A-Z0-9]*)\b/g)].map(m => m[1].toLowerCase())

        const allDetectedText = [...quotedTexts, ...capitalWords]

        // If any detected text is a valid brand-like word (not generic) AND doesn't match business
        for (const detected of allDetectedText) {
            // Skip common style descriptors
            if (['svg', 'png', 'jpg', 'brand', 'logo', 'icon', 'text'].includes(detected)) continue
            // Skip if it contains business name
            if (detected.includes(businessLower) || businessLower.includes(detected)) continue
            // Skip if very short
            if (detected.length < 3) continue
            // We have a mismatch
            gaps.push({
                priority: 'critical',
                field: 'logo.primary',
                suggestion: `⚠️ הלוגו המנותח מזהה טקסט "${detected.toUpperCase()}" אך שם העסק הוא "${draft.identity.businessName}". ייתכן שהקובץ placeholder או גרסה ישנה — בדקו.`,
                canAutoGenerate: false,
            })
            break   // only flag once
        }
    }

    if (!draft.colors.primary?.hex) {
        gaps.push({
            priority: 'critical',
            field: 'colors.primary',
            suggestion: 'צבע ראשי חסר — בחר צבע באונבורדינג',
            canAutoGenerate: false,
        })
    }

    if (!draft.typography.heading?.family) {
        gaps.push({
            priority: 'important',
            field: 'typography.heading',
            suggestion: 'גופן כותרות חסר — ברירת מחדל Rubik',
            canAutoGenerate: true,
        })
    }

    if (!draft.typography.hebrewSupport?.headingFamily) {
        gaps.push({
            priority: 'important',
            field: 'typography.hebrewSupport',
            suggestion: 'תמיכה בעברית חסרה — Rubik + Heebo מומלצים',
            canAutoGenerate: true,
        })
    }

    if (!draft.voice.tone) {
        gaps.push({
            priority: 'important',
            field: 'voice.tone',
            suggestion: 'טון דיבור חסר — נדרש להכוונת סוכני תוכן',
            canAutoGenerate: true,
        })
    }

    if (!draft.imagery.moodKeywords || draft.imagery.moodKeywords.length === 0) {
        gaps.push({
            priority: 'nice_to_have',
            field: 'imagery.moodKeywords',
            suggestion: 'מילות מצב-רוח חסרות — עוזרות לקריאייטיב',
            canAutoGenerate: true,
        })
    }

    if (!draft.principles || draft.principles.length === 0) {
        gaps.push({
            priority: 'nice_to_have',
            field: 'principles',
            suggestion: 'עקרונות brand constitution חסרים — 3-5 חוקים מנחים',
            canAutoGenerate: true,
        })
    }

    return gaps
}

function mergeGaps(fromLlm: Gap[], computed: Gap[]): Gap[] {
    const merged = [...fromLlm]
    for (const g of computed) {
        // Exact field match dedup (original behavior)
        if (!merged.some(m => m.field === g.field)) merged.push(g)
    }

    // Tier 3-U: dedup gaps that describe the SAME underlying issue.
    // Example observed: gap[0] field="logo.primary" critical + gap[1] field="logo.style" important —
    // both mention detected text "TOWNE" in a logo file. Keep the higher-priority one.
    //
    // Dedup strategy: group by (rootField, signatureToken). If >1 gap in group,
    // keep only the highest-priority one.
    const priorityRank: Record<Gap['priority'], number> = { critical: 0, important: 1, nice_to_have: 2 }
    const deduped: Gap[] = []
    const seenKeys = new Set<string>()
    for (const g of merged.sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority])) {
        const rootField = g.field.split('.')[0]   // "logo.primary" → "logo"
        // Extract signature token from suggestion — quoted strings (often the detected mismatch text)
        const quotedMatches = (g.suggestion || '').match(/["'"״]([A-Za-zא-ת][\w\s-]{1,30}?)["'"״]/g) || []
        const signatureToken = quotedMatches
            .map(s => s.replace(/["'"״]/g, '').trim().toUpperCase())
            .filter(s => s.length >= 3 && s.length <= 30)
            .sort()
            .join('|')

        const key = `${rootField}::${signatureToken}`
        // If no signature token, use field alone (original dedup path)
        if (!signatureToken) {
            // Already deduped above by field, keep
            deduped.push(g)
            continue
        }
        if (!seenKeys.has(key)) {
            seenKeys.add(key)
            deduped.push(g)
        }
        // else: same root+signature, keep only first (highest priority due to sort)
    }

    return deduped
}