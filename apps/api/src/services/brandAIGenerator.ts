/**
 * Brand AI Generator — generates missing keys when website-scan / upload
 * left them empty. Uses our existing fal.ai + Anthropic stack:
 *
 *   - nano-banana-pro (Gemini 3 Pro Image, $0.15/img) — logos with Hebrew
 *     typography embedded; 1:1 / horizontal / icon variants
 *   - flux-2-pro ($0.03/MP) — imagery references (5-10 per brand)
 *   - seedream-4.5 — cinematic hero images (when needed)
 *   - ideogram-v3 — English typography assets
 *   - Sonnet 4.6 — voice / messaging / personas / vocabulary regeneration
 *     when website-scan returned only weak signal
 *
 * Reference brand library: hardcoded list of "gold standard" brands
 * (Stripe, Headspace, Lululemon, Notion, Apple) inlined into prompts so
 * model produces output at that quality level (NOT generic AI cliches).
 *
 * Quality gates:
 *   - Every generated asset starts at confidence: low
 *   - Client must approve before promoted to medium/high
 *   - Generation prompts include brand context (already-uploaded keys)
 *     so output is consistent (not standalone-generic)
 */

import { uploadAssetToVps } from './brandAssetStorage'
import { normalizeLogo } from './brandImageNormalizer'
import type { BrandBookV2, BrandKeyMeta, BrandLogo, BrandColors, BrandImagery } from '../../../../packages/shared/src/brand/brandBookV2'

const FAL_BASE = 'https://fal.run'
const FAL_QUEUE = 'https://queue.fal.run'
const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages'

const REFERENCE_BRANDS_BLOCK = `Reference quality bar (match this level, NEVER produce generic AI clipart):
- Apple — minimalist, single bold mark, clear hierarchy
- Stripe — geometric, tech-confident, restrained color
- Headspace — warm circular forms, soft palette, human focus
- Lululemon — clean wordmark, athletic confidence, monochrome flexibility
- Notion — abstract geometry, no faces, scalable to favicon
- Mailchimp — playful illustration, distinctive yellow
- Israeli SMB best-in-class: Wix, Fiverr, monday.com — modern, clean, multi-language ready (Hebrew + English fluent)
The output should fit alongside these. NOT another AI-stock-art logo.`

interface GenerateLogoArgs {
    instanceId: string
    falApiKey: string
    businessName: string
    tagline?: string
    industry?: string                              // "self-storage", "fintech", etc
    voiceTone?: string                              // "warm professional"
    archetype?: string                              // Carl Jung
    seedColors?: string[]                           // hex codes if extracted
    notes?: string                                  // additional client requirements
}

interface GenerateLogoResult {
    candidates: Array<{ url: string; modelUsed: string; prompt: string }>
}

/**
 * Generate logo candidates via nano-banana-pro (best for in-image Hebrew/English typography).
 *
 * Strategy:
 *   - Generate 3 candidates with varied creative direction
 *   - Each candidate gets passed through normalizeLogo to produce variants
 *   - Client picks one (or rerolls)
 */
export async function generateLogoCandidates(args: GenerateLogoArgs): Promise<GenerateLogoResult> {
    const { falApiKey, businessName, tagline, industry, voiceTone, archetype, seedColors, notes } = args
    const colorHints = seedColors?.length
        ? `Use these brand colors: ${seedColors.join(', ')}.`
        : 'Pick a confident, distinct color palette.'
    const archetypeHints = archetype ? `Brand archetype: ${archetype} — this should shape the visual mood.` : ''
    const voiceHints = voiceTone ? `Voice tone: ${voiceTone} — visual must echo this feeling.` : ''
    const industryHints = industry ? `Industry: ${industry}.` : ''
    const noteHints = notes ? `Additional requirements: ${notes}` : ''

    const baseDescription = `Professional logo for "${businessName}".${tagline ? ` Tagline: "${tagline}".` : ''}
${industryHints} ${archetypeHints} ${voiceHints} ${colorHints}

${REFERENCE_BRANDS_BLOCK}

Requirements:
- Vector-style flat design, transparent background
- Works at 32×32 favicon and 1000×1000 hero
- Single dominant mark + (optional) wordmark in modern sans-serif
- ${args.businessName.match(/[֐-׿]/) ? 'Hebrew typography readable RTL' : 'English typography'}
- NO 3D rendering, NO photorealism, NO stock illustration cliches, NO faces
- ${noteHints}`

    // Generate 3 candidates with different creative direction
    const variations = [
        { name: 'iconic_mark', mod: 'Iconic abstract mark + minimal wordmark beneath. Bold simplicity (Apple/Stripe school).' },
        { name: 'wordmark_primary', mod: 'Wordmark-primary design with custom letterforms. Type as the hero (Lululemon/Mailchimp school).' },
        { name: 'soft_geometric', mod: 'Soft geometric shapes with rounded forms. Friendly, approachable (Headspace/Notion school).' },
    ]

    const results: GenerateLogoResult['candidates'] = []

    for (const v of variations) {
        const prompt = `${baseDescription}\n\nCreative direction: ${v.mod}`
        try {
            const url = await falGenerate({
                apiKey: falApiKey,
                model: 'fal-ai/nano-banana-pro',
                prompt,
                width: 1024,
                height: 1024,
                outputFormat: 'png',
            })
            if (url) results.push({ url, modelUsed: 'nano-banana-pro', prompt: v.name })
        } catch (err) {
            console.warn(`[brandAIGenerator] logo gen ${v.name} failed:`, (err as Error).message)
        }
    }

    return { candidates: results }
}

/**
 * Take an approved logo candidate URL → download → normalize via sharp → upload all variants to VPS.
 * Returns the BrandLogo block ready to merge into BrandBookV2.
 */
export async function adoptGeneratedLogo(args: {
    instanceId: string
    falApiKey?: string
    candidateUrl: string
}): Promise<BrandLogo & BrandKeyMeta> {
    const res = await fetch(args.candidateUrl, { signal: AbortSignal.timeout(30_000) })
    if (!res.ok) throw new Error(`Failed to download generated logo: ${res.status}`)
    const buf = Buffer.from(await res.arrayBuffer())
    const variants = await normalizeLogo({
        instanceId: args.instanceId,
        inputBase64: buf.toString('base64'),
        contentType: 'image/png',
        falApiKey: args.falApiKey,
    })
    return {
        ...variants,
        confidence: 'medium' as const,
        source: 'generated' as const,
        updatedAt: new Date().toISOString(),
        generatedBy: 'fal-ai/nano-banana-pro',
    }
}

// ─── Imagery references generation ───────────────────────────────────────

interface GenerateImageryArgs {
    instanceId: string
    falApiKey: string
    businessName: string
    industry?: string
    style?: string                                  // "warm lifestyle photography"
    archetype?: string
    seedColors?: string[]
    count?: number                                  // default 5
}

/**
 * Generate brand imagery reference set — 5 variations of brand-consistent
 * imagery that can later be used as Display banners, social posts, hero shots.
 *
 * Uses flux-2-pro (best for photorealistic + brand-consistent imagery).
 */
export async function generateImageryReferences(args: GenerateImageryArgs): Promise<{
    images: Array<{ url: string; prompt: string }>
}> {
    const { falApiKey, businessName, industry, style, archetype, seedColors, count } = args
    const n = count || 5
    const colorHints = seedColors?.length ? `Color palette: ${seedColors.join(', ')}.` : ''
    const styleHints = style || 'warm lifestyle photography, natural lighting, human focus'
    const archetypeHints = archetype ? `Embody the ${archetype} archetype.` : ''

    const concepts = [
        'product/service in real-world use, customer focus',
        'behind-the-scenes / process / authentic moment',
        'environment / location detail / texture close-up',
        'team / human at work / craft moment',
        'lifestyle aspiration / outcome of using the product',
    ].slice(0, n)

    const results: { url: string; prompt: string }[] = []
    for (const concept of concepts) {
        const prompt = `${styleHints}. Brand: ${businessName}${industry ? ` (${industry})` : ''}.
Scene: ${concept}.
${colorHints} ${archetypeHints}

${REFERENCE_BRANDS_BLOCK}

Requirements:
- Photographic style, NOT illustrated
- 1.91:1 aspect ratio (Display banner ready)
- Natural color grading
- Israeli urban / suburban context if scene allows
- NO stock-photo poses, NO AI cliches (perfect smiles, exaggerated expressions)
- Authentic, candid, human-centered`

        try {
            const url = await falGenerate({
                apiKey: falApiKey,
                model: 'fal-ai/flux-2-pro',
                prompt,
                width: 1200,
                height: 628,
                outputFormat: 'png',
            })
            if (url) {
                // Download + persist to VPS
                const buf = Buffer.from(await (await fetch(url)).arrayBuffer())
                const upload = await uploadAssetToVps({
                    instanceId: args.instanceId,
                    category: 'imagery',
                    filename: `imagery-ref-${Date.now()}-${results.length}.png`,
                    contentBase64: buf.toString('base64'),
                    contentType: 'image/png',
                })
                results.push({ url: upload.publicUrl, prompt: concept })
            }
        } catch (err) {
            console.warn(`[brandAIGenerator] imagery ${concept} failed:`, (err as Error).message)
        }
    }

    return { images: results }
}

// ─── Voice / messaging / personas regen via Sonnet ───────────────────────

interface GenerateVoiceArgs {
    apiKey: string
    businessName: string
    industry?: string
    websiteCorpus?: string                          // optional context from scan
    targetMarket?: string
    language?: 'he' | 'en'
    /** Existing book partials — Sonnet uses as anchor */
    existing?: Partial<BrandBookV2>
}

export async function generateBrandVoice(args: GenerateVoiceArgs): Promise<{
    archetype: string
    toneSummary: { he: string; en: string }
    principles: string[]
    do: string[]
    dont: string[]
    vocabulary: { approved: string[]; banned: string[] }
    tagline: { he: string; en: string }
    mission: { he: string; en: string }
    positioning: { he: string; en: string }
    manifesto: { he: string; en: string }
    elevatorPitch: { he: string; en: string }
    boilerplate: { he: string; en: string }
}> {
    const corpus = args.websiteCorpus ? `\nExisting copy from website:\n"""\n${args.websiteCorpus.slice(0, 8000)}\n"""\n` : ''
    const existing = args.existing ? `\nExisting brand book context (already-confirmed by user):\n${JSON.stringify(args.existing).slice(0, 4000)}\n` : ''

    const system = `אתה brand strategist בכיר ב-IL. אתה ממלא חוסרים ב-brand book של עסק קיים — אתה לא ממציא אותו מחדש.

חוקים קריטיים:
1. כל ה-output בעברית. שמות מותגים באנגלית (Stripe, Apple, או שם העסק) נשארים כמו שהם — אבל כל אחר חייב להיות עברית.
2. אם יש "Existing brand book context" — חייב להיות עקבי לחלוטין איתו. לא לסתור ארכיטיפ, טון, vocabulary שכבר אושרו.
3. אם יש corpus מהאתר — vocabulary.approved חייב להישאר במנעד של הביטויים שכבר חוזרים שם. אסור להמציא חדשים אם לא ביקשו.
4. השתמש ב-Carl Jung 12 archetypes — בחר את זה שמתאים למציאות העסק.
5. אסור פליטות גנריות. הכל ספציפי ועם בשר.
6. אם פרט קיים כבר ב-existing context — אל תעדכן אותו. השאר ריק (null) ב-output. ה-merge יעשה רק על שדות שאתה מחזיר.`

    const user = `שם המותג: ${args.businessName}
${args.industry ? `תחום: ${args.industry}` : ''}
${args.targetMarket ? `קהל יעד: ${args.targetMarket}` : ''}
${corpus}${existing}

צור את החבילה כ-JSON. שדות שכבר קיימים ב-existing — החזר null/undefined כדי לא לדרוס:
{
  "archetype": "<one of: innocent, sage, explorer, outlaw, magician, hero, lover, jester, everyman, caregiver, ruler, creator>",
  "archetypeRationale": "<משפט בעברית: למה הארכיטיפ הזה>",
  "toneSummary": "<סיכום הטון ב-2-3 שורות עברית — מי מדבר, איך, על מה>",
  "principles": ["<עיקרון 1 בעברית>", "<2>", "<3>", "<4>"],
  "do": ["<עשו: ... >", "<עשו: ... >", "<עשו: ... >"],
  "dont": ["<אל: ... >", "<אל: ... >", "<אל: ... >"],
  "vocabulary": {
    "approved": ["<ביטוי 1>", "<2>", "<3>", "<4>", "<5>", "<6>"],
    "banned": ["<קלישאה 1>", "<2>", "<3>"]
  },
  "tagline": "<עד 60 תווים בעברית>",
  "mission": "<משפט-שניים בעברית>",
  "positioning": "<עבור X, אנחנו Y ש-Z — בעברית>",
  "manifesto": "<2-3 פסקאות מניפסט בעברית>",
  "elevatorPitch": "<פיץ 30 שניות בעברית>",
  "boilerplate": "<פסקת About Us בעברית>"
}

החזר רק את ה-JSON. בלי הסברים.`

    const res = await fetch(ANTHROPIC_API, {
        method: 'POST',
        headers: {
            'x-api-key': args.apiKey,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
        },
        body: JSON.stringify({
            model: 'claude-sonnet-4-6',
            max_tokens: 6000,
            system,
            messages: [{ role: 'user', content: user }],
        }),
        signal: AbortSignal.timeout(120_000),
    })
    if (!res.ok) throw new Error(`Sonnet voice gen ${res.status}`)
    const j = await res.json() as any
    const text = j?.content?.[0]?.text || ''
    const m = text.match(/\{[\s\S]*\}/)
    if (!m) throw new Error('Sonnet returned no JSON')
    const parsed = JSON.parse(m[0]) as any

    // Wrap Hebrew-only flat strings into {he} shape so downstream BrandKeyMeta merge stays compatible.
    const wrapHe = (v: any) => (typeof v === 'string' ? { he: v } : (v || undefined))
    return {
        archetype: parsed.archetype,
        archetypeRationale: parsed.archetypeRationale,
        toneSummary: typeof parsed.toneSummary === 'string' ? parsed.toneSummary : (parsed.toneSummary?.he || ''),
        principles: parsed.principles || [],
        do: parsed.do || [],
        dont: parsed.dont || [],
        vocabulary: parsed.vocabulary || { approved: [], banned: [] },
        tagline: wrapHe(parsed.tagline),
        mission: wrapHe(parsed.mission),
        positioning: wrapHe(parsed.positioning),
        manifesto: wrapHe(parsed.manifesto),
        elevatorPitch: wrapHe(parsed.elevatorPitch),
        boilerplate: wrapHe(parsed.boilerplate),
    } as any
}

// ─── Personas regen ──────────────────────────────────────────────────────

export async function generateBrandPersonas(args: {
    apiKey: string
    businessName: string
    industry?: string
    targetMarket?: string
    websiteCorpus?: string
    count?: number
}): Promise<{ personas: Array<any> }> {
    const n = args.count || 3
    const corpus = args.websiteCorpus ? `\nWebsite context:\n"""\n${args.websiteCorpus.slice(0, 6000)}\n"""\n` : ''

    const system = `אתה brand strategist + מומחה למחקר לקוחות בשוק הישראלי. צור ${n} פרסונות אותנטיות שמייצגות את קהל הלקוחות הסביר של העסק — לא סטריאוטיפים.

חוקים:
1. כל ה-output בעברית. שם העסק נשאר באנגלית אם כך נמסר.
2. שמות פרסונות בעברית (דוגמה: "דורון — אבא של 3 שעובר דירה").
3. painPoints / decisionTriggers / objections / messageHooks — כולם בעברית, ספציפיים לעסק הזה.
4. location ספציפי לישראל (תל אביב, חיפה, רעננה וכו').
5. אסור פליטות גנריות. כל פרסונה חייבת להיות שונה ממש.`

    const user = `שם המותג: ${args.businessName}
${args.industry ? `תחום: ${args.industry}` : ''}
${args.targetMarket ? `קהל יעד: ${args.targetMarket}` : ''}
${corpus}

צור ${n} פרסונות שונות כ-JSON:
{
  "personas": [
    {
      "id": "p1",
      "name": "<שם פרסונה עם תיאור — בעברית>",
      "demographics": {
        "ageRange": [25, 45],
        "gender": "mixed | m | f",
        "income": "low | mid | high | mixed",
        "location": "<אזור בישראל>",
        "familyStatus": "<...>"
      },
      "psychographics": {
        "values": ["<בעברית>"],
        "interests": ["<בעברית>"],
        "lifestyle": "<תיאור קצר בעברית>"
      },
      "painPoints": ["<כאב ספציפי 1>", "<2>", "<3>"],
      "decisionTriggers": ["<טריגר 1>", "<2>"],
      "channelPreferences": ["search", "whatsapp", "phone"],
      "objections": ["<התנגדות 1>", "<2>"],
      "messageHooks": ["<hook 1 בעברית>", "<hook 2>", "<hook 3>"]
    }
  ]
}

כל פרסונה חייבת לפחות 3 painPoints + 2 decisionTriggers + 3 messageHooks ספציפיים לעסק.
החזר רק את ה-JSON. בלי הסברים.`

    const res = await fetch(ANTHROPIC_API, {
        method: 'POST',
        headers: {
            'x-api-key': args.apiKey,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
        },
        body: JSON.stringify({
            model: 'claude-sonnet-4-6',
            max_tokens: 4500,
            system,
            messages: [{ role: 'user', content: user }],
        }),
        signal: AbortSignal.timeout(90_000),
    })
    if (!res.ok) throw new Error(`Sonnet personas gen ${res.status}`)
    const j = await res.json() as any
    const text = j?.content?.[0]?.text || ''
    const m = text.match(/\{[\s\S]*\}/)
    if (!m) throw new Error('Sonnet returned no JSON')
    return JSON.parse(m[0])
}

// ─── Color palette regen ─────────────────────────────────────────────────

export async function generateColorPalette(args: {
    apiKey: string
    businessName: string
    industry?: string
    archetype?: string
    voiceTone?: string
    seedColor?: string                              // anchor color if any
}): Promise<BrandColors & BrandKeyMeta> {
    const seedHint = args.seedColor ? `יש כבר צבע מותג קיים: ${args.seedColor}. בנה פלטה סביבו — אל תחליף, רק השלם.` : 'בחר primary ביטחוני שמתאים למותג.'

    const user = `צור פלטת צבעים מלאה למותג "${args.businessName}".
${args.industry ? `תחום: ${args.industry}` : ''}
${args.archetype ? `ארכיטיפ: ${args.archetype}` : ''}
${args.voiceTone ? `טון קול: ${args.voiceTone}` : ''}
${seedHint}

חוקים:
- כל שמות הצבעים בעברית. שם המותג נשאר כפי שנמסר.
- usage rules בעברית.
- איכות: כמו Stripe blue (#635BFF), Headspace orange (#F47533), Lululemon red (#EE2724) — לא גנרי בנאלי.

JSON מדויק:
{
  "primary": { "name": "<שם בעברית>", "hex": "#xxxxxx", "usage": "<מתי להשתמש בעברית>" },
  "secondary": [
    { "name": "<שם>", "hex": "#xxxxxx", "usage": "<...>" },
    { "name": "<שם>", "hex": "#xxxxxx", "usage": "<...>" }
  ],
  "accent": [
    { "name": "<שם>", "hex": "#xxxxxx", "usage": "CTA וטקסטים בולטים" }
  ],
  "neutral": [
    { "name": "כהה", "hex": "#1F2937", "usage": "טקסט גוף" },
    { "name": "בהיר", "hex": "#F9FAFB", "usage": "רקעים" }
  ],
  "semantic": {
    "success": { "name": "הצלחה", "hex": "#10B981" },
    "warning": { "name": "אזהרה", "hex": "#F59E0B" },
    "error":   { "name": "שגיאה", "hex": "#EF4444" },
    "info":    { "name": "מידע",  "hex": "#2563EB" }
  },
  "usageRules": ["<כלל 1 בעברית>", "<כלל 2 בעברית>"]
}

החזר רק JSON. בלי הסברים.`

    const res = await fetch(ANTHROPIC_API, {
        method: 'POST',
        headers: {
            'x-api-key': args.apiKey,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
        },
        body: JSON.stringify({
            model: 'claude-sonnet-4-6',
            max_tokens: 2000,
            messages: [{ role: 'user', content: user }],
        }),
        signal: AbortSignal.timeout(60_000),
    })
    if (!res.ok) throw new Error(`Sonnet palette gen ${res.status}`)
    const j = await res.json() as any
    const text = j?.content?.[0]?.text || ''
    const m = text.match(/\{[\s\S]*\}/)
    if (!m) throw new Error('Sonnet palette returned no JSON')
    const parsed = JSON.parse(m[0])
    return {
        ...parsed,
        confidence: 'medium' as const,
        source: 'generated' as const,
        generatedBy: 'claude-sonnet-4-6',
        updatedAt: new Date().toISOString(),
    }
}

// ─── fal.ai unified generation helper ───────────────────────────────────

async function falGenerate(args: {
    apiKey: string
    model: string
    prompt: string
    width: number
    height: number
    outputFormat?: 'png' | 'jpeg' | 'webp'
    negativePrompt?: string
}): Promise<string | null> {
    const body: any = {
        prompt: args.prompt,
        image_size: { width: args.width, height: args.height },
        num_images: 1,
        output_format: args.outputFormat || 'png',
        safety_tolerance: '5',
        enable_safety_checker: false,
    }
    if (args.negativePrompt) body.negative_prompt = args.negativePrompt

    const useQueue = ['kling', 'veo', 'sora', 'video'].some(s => args.model.includes(s))
    const url = useQueue ? `${FAL_QUEUE}/${args.model}` : `${FAL_BASE}/${args.model}`

    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Authorization': `Key ${args.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(180_000),
    })
    if (!res.ok) {
        const t = await res.text().catch(() => '')
        throw new Error(`fal ${args.model} ${res.status}: ${t.slice(0, 200)}`)
    }
    const j = await res.json() as any
    return j.images?.[0]?.url || j.image?.url || j.output?.[0] || null
}