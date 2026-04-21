/**
 * Scenario Registry — the single source of truth for creative recipes.
 *
 * Each scenario is one "creative recipe" combining: which fal.ai (or
 * ElevenLabs) model to call, at what aspect ratio / resolution, with what
 * post-processing steps, and under what conditions the orchestrator
 * chooses it.
 *
 * Users override the DEFAULT model per scenario via the Settings UI.
 * Overrides persist to `instance.researchData.creativeRouting[scenarioId]`.
 *
 * The orchestrator calls resolveScenarioModel() to get the final model
 * after applying user overrides.
 */

export type FalImageModelChoice =
    | 'flux-2-pro'
    | 'flux-pro-1.1'
    | 'flux-schnell'
    | 'nano-banana-pro'
    | 'seedream-4.5'
    | 'ideogram-v3'

export type FalVideoModelChoice =
    | 'kling-2.5-turbo-pro'
    | 'kling-2.6-pro'
    | 'seedance-2.0'
    | 'seedance-2.0-fast'
    | 'veo-3.1'
    | 'sora-2'
    | 'hailuo-02-pro'
    | 'ltx-2'
    | 'pixverse-v6'

export type FalLipsyncModelChoice =
    | 'latentsync'
    | 'sync-lipsync-v3'

export type ElevenLabsModelChoice =
    | 'eleven_multilingual_v2'
    | 'eleven_turbo_v2_5'
    | 'eleven_v3'

export type ScenarioModel =
    | FalImageModelChoice
    | FalVideoModelChoice
    | FalLipsyncModelChoice
    | ElevenLabsModelChoice

export type ScenarioKind = 'image' | 'video' | 'voice' | 'lipsync'

export interface ScenarioSpec {
    id: string
    labelHe: string
    kind: ScenarioKind
    purpose: string                  // one-line what it's for
    defaultModel: ScenarioModel
    eligibleModels: ScenarioModel[]   // user can pick any of these
    aspectRatio: string               // '1.91:1' | '1:1' | '4:5' | '9:16' | '16:9' | 'n/a'
    width?: number                     // target dimensions (for image/video)
    height?: number
    estCostUsd: number                // typical per-output cost
    appliesWhen: string[]             // channel/type combinations that trigger default routing
    steps: string[]                    // human-readable step-by-step of what happens
    pros: string[]
    cons: string[]
}

// ─── Starter catalog (April 2026) ───────────────────────────────────────
export const SCENARIOS: ScenarioSpec[] = [
    {
        id: 'ad-hero-flux',
        labelHe: 'פיד פרסומי — Flux 2',
        kind: 'image',
        purpose: 'תמונת גיבור לפיד Facebook/LinkedIn — איכות תמונתית גבוהה ללא טקסט בתוך התמונה',
        defaultModel: 'flux-2-pro',
        eligibleModels: ['flux-2-pro', 'flux-pro-1.1', 'seedream-4.5', 'nano-banana-pro', 'ideogram-v3'],
        aspectRatio: '1.91:1',
        width: 1200,
        height: 630,
        estCostUsd: 0.07,
        appliesWhen: ['facebook:post', 'linkedin:post', 'meta_ads:post'],
        steps: [
            'Opus כותב imagePrompt בשפה דוקומנטרית/עריכתית (Kodak Portra, 35mm, candid moment)',
            'fal-ai/flux-2-pro מייצר 3 וריאנטים במידות 1200×630',
            'אם brief.overlayText קיים → sharp+SVG מוסיף כותרת עברית על שליש מהתמונה',
            'SFTP לנתיב /home/openclaw/.openclaw/media/ ב-VPS של הלקוח',
            'שמירה של scenario + model ב-DB לצורך ניתוח ביצועים',
        ],
        pros: ['הכי טוב עבור prompt-following', 'טקסטורה טבעית של עור', 'פלטה עשירה'],
        cons: ['לא מרנדר טקסט בתוך התמונה — חובה overlay בקוד'],
    },
    {
        id: 'ad-typography-nano',
        labelHe: 'פרסומת עם טקסט — Nano Banana Pro',
        kind: 'image',
        purpose: 'כשהוויזואל חייב טקסט עברי בתוך התמונה (שלט חנות, אריזה, כרזה)',
        defaultModel: 'nano-banana-pro',
        eligibleModels: ['nano-banana-pro', 'ideogram-v3'],
        aspectRatio: '1.91:1',
        width: 1200,
        height: 630,
        estCostUsd: 0.45, // brief + 3 × $0.15
        appliesWhen: ['facebook:post:with-text', 'linkedin:post:with-text'],
        steps: [
            'Opus מחליט שהטקסט חייב להיות בתוך התמונה (לוגו, שלט, אריזה)',
            'fal-ai/nano-banana-pro (Google Gemini 3 Pro Image) מייצר 3 ווריאנטים',
            'הטקסט העברי מרונדר ישירות ע״י המודל (תמיכה מלאה)',
            'ללא overlay בקוד — המודל טיפל בטקסט',
        ],
        pros: ['תמיכה רשמית בעברית', '100+ שפות'],
        cons: ['יקר יותר — $0.15/תמונה', 'פחות שליטה על composition'],
    },
    {
        id: 'story-reel-vertical',
        labelHe: 'סטורי/ריל אנכי',
        kind: 'image',
        purpose: 'תמונת cover לסטורי או ריל 9:16 — cinematic ועמוק',
        defaultModel: 'seedream-4.5',
        eligibleModels: ['seedream-4.5', 'flux-2-pro', 'nano-banana-pro'],
        aspectRatio: '9:16',
        width: 1080,
        height: 1920,
        estCostUsd: 0.06,
        appliesWhen: ['instagram:story', 'instagram:reel', 'tiktok:post'],
        steps: [
            'Opus כותב prompt עם cinematic vocabulary (Cinestill 800T, golden hour)',
            'Seedream 4.5 מייצר ב-4K ready איכות ב-9:16',
            'Sharp מקפל (downsize to 1080×1920) ומוסיף overlay אם יש',
            'SFTP + DB',
        ],
        pros: ['4K-ready, איכות סרט', 'פלטה עשירה'],
        cons: ['תמיכה פחותה בעברית — overlay חובה'],
    },
    {
        id: 'blog-hero-wide',
        labelHe: 'כותרת בלוג (16:9)',
        kind: 'image',
        purpose: 'תמונת hero לפוסט בלוג — רוחב קולנועי, מרחב שלילי לכותרת',
        defaultModel: 'flux-2-pro',
        eligibleModels: ['flux-2-pro', 'seedream-4.5', 'nano-banana-pro'],
        aspectRatio: '16:9',
        width: 1920,
        height: 1080,
        estCostUsd: 0.10,
        appliesWhen: ['blog:article', 'email:post'],
        steps: [
            'Opus מחייב מרחב שלילי בשליש המתאים (למיקום כותרת)',
            'Flux 2 Pro מייצר 3 ווריאנטים ב-1920×1080',
            'Sharp מוסיף כותרת עברית אם overlayText קיים',
        ],
        pros: ['רזולוציה גבוהה', 'composition קולנועי'],
        cons: ['יקר יותר (MP יותר)'],
    },
    {
        id: 'english-poster-ideogram',
        labelHe: 'פוסטר באנגלית',
        kind: 'image',
        purpose: 'כרזה עם טקסט באנגלית (LinkedIn, global campaigns)',
        defaultModel: 'ideogram-v3',
        eligibleModels: ['ideogram-v3', 'nano-banana-pro'],
        aspectRatio: '1:1',
        width: 1080,
        height: 1080,
        estCostUsd: 0.08,
        appliesWhen: ['linkedin:poster', 'global:post'],
        steps: [
            'Opus כותב פרומפט עם טקסט באנגלית integral לעיצוב',
            'Ideogram V3 מרונדר את הטקסט באיכות 90-95%',
            'ללא overlay — המודל טיפל',
        ],
        pros: ['הטוב ביותר לטקסט באנגלית', 'נקי לפוסטרים'],
        cons: ['לא מתאים לעברית'],
    },
    {
        id: 'quick-draft-schnell',
        labelHe: 'טיוטה מהירה (חסכונית)',
        kind: 'image',
        purpose: 'תצוגה מקדימה זולה כשרוצים לבדוק כיוון — 12× זול יותר',
        defaultModel: 'flux-schnell',
        eligibleModels: ['flux-schnell', 'flux-pro-1.1'],
        aspectRatio: '1:1',
        width: 1024,
        height: 1024,
        estCostUsd: 0.01,
        appliesWhen: ['preview:post'],
        steps: [
            'Flux Schnell מייצר ב-4 שלבים בלבד (~2 שניות)',
            'איכות נמוכה יותר — בשביל iteration מהיר',
        ],
        pros: ['~$0.003/תמונה', 'מהיר'],
        cons: ['איכות נמוכה, פחות נאמן לפרומפט'],
    },
    // ─── VIDEO scenarios (April 2026 research, implementation in Phase M.2) ───
    {
        id: 'reel-vertical-short',
        labelHe: 'ריל/סטורי וידאו (9:16)',
        kind: 'video',
        purpose: 'וידאו אנכי 9:16 של 5-10 שניות ל-Reels / TikTok / Shorts — השקעה עיקרית לפרסום מודל הכי גבוה',
        defaultModel: 'kling-2.5-turbo-pro',
        eligibleModels: ['kling-2.5-turbo-pro', 'kling-2.6-pro', 'seedance-2.0-fast', 'hailuo-02-pro', 'veo-3.1'],
        aspectRatio: '9:16',
        width: 1080,
        height: 1920,
        estCostUsd: 1.10, // Flux hero + Kling 2.5 10s + VO + overlay
        appliesWhen: ['instagram:reel', 'tiktok:post', 'youtube:shorts'],
        steps: [
            'Flux 2 Pro מייצר תמונת hero ב-9:16 (first frame)',
            'Kling 2.5 Turbo Pro I2V מפיק 10 שניות תנועה מאותה תמונה',
            'ElevenLabs מייצר קריינות עברית (אם נדרש)',
            'FFmpeg מקבל את הווידאו + overlay עברי (drawtext) + mux audio',
            'SFTP ל-VPS + שמירה ב-DB',
        ],
        pros: ['איכות סרט בעלות סבירה', 'עקביות דמות/מוצר דרך hero frame'],
        cons: ['לא מרנדר טקסט — overlay דרך FFmpeg חובה', 'איטי (~60 שניות למעלה)'],
    },
    {
        id: 'blog-hero-video',
        labelHe: 'לולאת וידאו לבלוג (16:9)',
        kind: 'video',
        purpose: 'לולאה קצרה של 5 שניות ב-16:9 לכותרת פוסט בלוג — תנועה עדינה במקום תמונה סטטית',
        defaultModel: 'ltx-2',
        eligibleModels: ['ltx-2', 'kling-2.5-turbo-pro', 'hailuo-02-pro', 'pixverse-v6'],
        aspectRatio: '16:9',
        width: 1280,
        height: 720,
        estCostUsd: 0.15,
        appliesWhen: ['blog:hero-video'],
        steps: [
            'Flux 2 Pro hero 16:9',
            'LTX-2 19B I2V (זול) או Kling 2.5 (פרימיום) — 5 שניות',
            'ללא קריינות, רק תנועה ויזואלית',
            'FFmpeg מוסיף fade-in/out ליצירת לולאה',
        ],
        pros: ['זול במיוחד עם LTX-2 (~$0.10)', 'דינמיות לפוסט בלוג'],
        cons: ['LTX-2 איכות נמוכה יותר מ-Kling'],
    },
    {
        id: 'ugc-testimonial',
        labelHe: 'עדות מייסד (Talking Head)',
        kind: 'video',
        purpose: 'וידאו של מייסד מדבר — פנים אמיתיות, קריינות עברית, סנכרון שפתיים. ההמרה הכי גבוהה ל-SMB',
        defaultModel: 'kling-2.5-turbo-pro',
        eligibleModels: ['kling-2.5-turbo-pro', 'kling-2.6-pro', 'seedance-2.0', 'veo-3.1'],
        aspectRatio: '9:16',
        width: 1080,
        height: 1920,
        estCostUsd: 1.30,
        appliesWhen: ['instagram:reel-testimonial', 'facebook:video-ad'],
        steps: [
            'המשתמש מעלה תמונת פנים של המייסד',
            'Kling 2.5 I2V מוסיף תנועה עדינה (5 שניות)',
            'ElevenLabs מייצר קריינות עברית מהסקריפט',
            'LatentSync ($0.20) מסנכרן שפתיים לקריינות',
            'FFmpeg מוסיף כרטיס כותרת + CTA',
        ],
        pros: ['ההמרה הכי גבוהה לקטגוריית SMB בישראל'],
        cons: ['תלוי באיכות התמונה שהמשתמש מעלה'],
    },
    {
        id: 'product-demo-short',
        labelHe: 'הדגמת מוצר (1:1, 15s)',
        kind: 'video',
        purpose: 'מוצר בתנועה 15 שניות — 3 זוויות/שוטים בקומפוזיציה אחת',
        defaultModel: 'seedance-2.0',
        eligibleModels: ['seedance-2.0', 'kling-2.5-turbo-pro', 'sora-2'],
        aspectRatio: '1:1',
        width: 1080,
        height: 1080,
        estCostUsd: 1.80,
        appliesWhen: ['instagram:product-post', 'ecommerce:showcase'],
        steps: [
            'Flux 2 Pro מייצר תמונת מוצר 1:1',
            'Seedance 2.0 multi-shot (שליטה קולנועית) — 3 beats ב-10 שניות',
            'Kling 2.5 5 שניות close-up נוסף',
            'Creatomate ממזג שני הקטעים + כרטיסי טקסט עבריים',
        ],
        pros: ['multi-shot בקריאה אחת', 'שליטה מלאה על camera movement'],
        cons: ['יקר — $1.80/רולל', 'מתאים רק להצגת מוצר'],
    },
    {
        id: 'cinematic-hero-premium',
        labelHe: 'סרטון פרימיום (Veo 3.1)',
        kind: 'video',
        purpose: 'money-shot של 8 שניות ב-1080p עם אודיו מקורי — רק ללקוחות פרימיום',
        defaultModel: 'veo-3.1',
        eligibleModels: ['veo-3.1', 'sora-2', 'kling-2.6-pro'],
        aspectRatio: '16:9',
        width: 1920,
        height: 1080,
        estCostUsd: 3.30,
        appliesWhen: ['youtube:pre-roll', 'premium:hero-video'],
        steps: [
            'Flux 2 Pro hero 16:9',
            'Veo 3.1 I2V עם אודיו מקורי (~8 שניות)',
            'FFmpeg overlay CTA בעברית',
        ],
        pros: ['איכות Hollywood', '4K זמין', 'אודיו מובנה'],
        cons: ['$0.40/שניה עם אודיו — יקר'],
    },
    {
        id: 'story-sequence-30s',
        labelHe: 'סדרה 30 שניות (3 סצנות)',
        kind: 'video',
        purpose: 'סטוריבורד 3-סצנות לקמפיין דגל — מעברים חלקים בין סצנות',
        defaultModel: 'kling-2.5-turbo-pro',
        eligibleModels: ['kling-2.5-turbo-pro', 'veo-3.1', 'seedance-2.0'],
        aspectRatio: '9:16',
        width: 1080,
        height: 1920,
        estCostUsd: 3.50,
        appliesWhen: ['flagship:campaign'],
        steps: [
            '3 × Flux 2 Pro hero frames',
            'Kling 2.5 I2V 10 שניות לכל אחד (שרשור tail-image) או Veo 3.1 first-last-frame',
            'Creatomate ממזג + עיברית titles + ElevenLabs narration',
        ],
        pros: ['מסר מלא של 30 שניות', 'מעברים חלקים בין סצנות'],
        cons: ['ההשקעה הגבוהה ביותר בעלות ובזמן'],
    },
    {
        id: 'lipsync-hebrew',
        labelHe: 'סנכרון שפתיים עברי',
        kind: 'lipsync',
        purpose: 'פוסט-פרודקשן — לקיחת וידאו קיים + קריינות עברית → סנכרון שפתיים',
        defaultModel: 'latentsync',
        eligibleModels: ['latentsync', 'sync-lipsync-v3'],
        aspectRatio: 'n/a',
        estCostUsd: 0.20,
        appliesWhen: ['ugc-testimonial:post-process'],
        steps: [
            'קלט: קטע וידאו עם דמות + קובץ אודיו ElevenLabs',
            'LatentSync ($0.20 עד 40 שניות) — זול ואיכותי',
            'או Sync Lipsync v3 ($0.70/דקה) — איכות גבוהה יותר',
            'החזרת קובץ MP4 מסונכרן',
        ],
        pros: ['LatentSync שווה-ערך ב-1/3 מהעלות של v3', 'עובד עם כל וידאו'],
        cons: ['לא תומך בעברית מושלם — בודק תנועת שפתיים general'],
    },
    {
        id: 'voiceover-he',
        labelHe: 'קריינות בעברית',
        kind: 'voice',
        purpose: 'קריינות TTS עברית ל-Reels/ads',
        defaultModel: 'eleven_multilingual_v2',
        eligibleModels: ['eleven_multilingual_v2', 'eleven_turbo_v2_5', 'eleven_v3'],
        aspectRatio: 'n/a',
        estCostUsd: 0.18, // per 1K chars
        appliesWhen: ['reel:voiceover', 'ads:voiceover'],
        steps: [
            'ElevenLabs Multilingual v2 מייצר קול בעברית (תמיכה מלאה)',
            'קובץ MP3 נשמר ב-VPS תחת /media/',
            'Creatomate/ffmpeg ממזג עם וידאו בשלב הבא (פאזה M.2)',
        ],
        pros: ['איכות הכי גבוהה לעברית', 'שכפול קול אפשרי'],
        cons: ['איטי יותר מ-Turbo'],
    },
    {
        id: 'voiceover-en',
        labelHe: 'קריינות באנגלית',
        kind: 'voice',
        purpose: 'קריינות TTS אנגלית לקהלים גלובליים',
        defaultModel: 'eleven_turbo_v2_5',
        eligibleModels: ['eleven_turbo_v2_5', 'eleven_multilingual_v2', 'eleven_v3'],
        aspectRatio: 'n/a',
        estCostUsd: 0.15,
        appliesWhen: ['global:voiceover'],
        steps: [
            'Turbo v2.5 — מהיר, איכות גבוהה לאנגלית',
            'MP3 ל-VPS',
        ],
        pros: ['פי 3 מהיר', 'זול'],
        cons: ['פחות טוב לשפות אחרות'],
    },
]

export function getScenario(id: string): ScenarioSpec | undefined {
    return SCENARIOS.find(s => s.id === id)
}

/**
 * Resolve the effective model for a scenario given user overrides.
 * Falls back to the scenario's default if no override is set.
 */
export function resolveScenarioModel(
    scenarioId: string,
    userRouting: Record<string, string> | null | undefined,
): { scenario: ScenarioSpec; model: ScenarioModel } | null {
    const scenario = getScenario(scenarioId)
    if (!scenario) return null
    const override = userRouting?.[scenarioId]
    const model = (override && scenario.eligibleModels.includes(override as ScenarioModel))
        ? (override as ScenarioModel)
        : scenario.defaultModel
    return { scenario, model }
}

/**
 * Given a plan item context (channel + type + whether overlay text is needed),
 * pick the best-fit scenario id. Used by the orchestrator when brief.modelHint
 * is vague or when Opus didn't think about scenarios.
 */
export function pickScenarioForItem(opts: {
    channel: string
    type: string
    wantsTypography?: boolean
}): string {
    const { channel, type, wantsTypography } = opts
    if (type === 'reel' || type === 'story' || channel === 'tiktok' || type === 'carousel') {
        return 'story-reel-vertical'
    }
    if (wantsTypography) return 'ad-typography-nano'
    if (type === 'article' || channel === 'blog' || channel === 'email') return 'blog-hero-wide'
    return 'ad-hero-flux'
}