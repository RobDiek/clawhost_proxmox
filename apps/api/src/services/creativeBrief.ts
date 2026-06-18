/**
 * Creative Brief Generator v2 (Phase M.1.5 quality leap, April 2026 research)
 *
 * Opus 4.7 reads: content plan item + brand book + optimization report +
 * per-channel stats. Returns a STRUCTURED brief for fal.ai image generation:
 *   - imagePrompt: documentary/editorial style with film-stock vocabulary,
 *     not "clean commercial photography" (that phrase attracts AI-stock).
 *   - negativePrompt: aggressive AI-stock killers.
 *   - styleAnchor: reused across iterations for visual identity consistency.
 *   - modelHint: which fal.ai model fits best (flux-2-pro | nano-banana-pro |
 *     seedream-4.5 | ideogram-v3).
 *   - overlayText / overlayPosition: Hebrew typography is composited on mgmt
 *     (sharp + SVG) AFTER generation — the image must have negative space.
 *
 * See: project_media_pipeline.md for the architectural decisions.
 */
import { eq, and } from 'drizzle-orm'
import { db } from '@/db'
import { instances, brandBooks } from '@/db/schema'
import { getApiKeyForInstance, formatLatestOptimizationReport, formatAgentStats, resolveDirectModel } from '@/controllers/hosting/agentSetup'

export interface PlanItemContext {
    id: string
    hook: string
    brief: string
    pillar: string
    persona: string
    channel: string
    type: string
    productRef?: string
    ctaType?: string
}

// fal.ai model identifiers the orchestrator recognizes. See falAI.ts for
// actual endpoint + body-builder mapping.
export type ModelHint = 'flux-2-pro' | 'flux-pro-1.1' | 'flux-schnell' | 'nano-banana-pro' | 'seedream-4.5' | 'ideogram-v3'

// Where the overlay should go (sharp composite targets one third of the image).
export type OverlayPosition = 'top' | 'bottom' | 'left' | 'right' | 'none'

export interface CreativeBriefOutput {
    imagePrompt: string
    negativePrompt: string
    styleAnchor: string
    rationale: string
    costUsd: number

    // New in v2 — decision outputs consumed by orchestrator
    modelHint: ModelHint
    overlayText: string            // Hebrew string to composite post-gen; '' = no overlay
    overlayPosition: OverlayPosition

    // Video extensions (populated only when item.type is reel/story/video) —
    // drive the Kling/Veo I2V step + ElevenLabs VO + FFmpeg mux.
    video?: {
        motionPrompt: string         // Kling I2V motion description (camera, subject movement)
        durationSec: 5 | 10          // Kling 2.5 Turbo Pro supports 5 or 10
        voiceScriptHe: string        // Hebrew voiceover script (ElevenLabs input; '' = no VO)
        voiceScriptEn?: string       // Optional English VO for global reuse
        voiceStyle: 'casual' | 'confident' | 'intimate' | 'energetic' | 'narrator'
        musicMood: string            // Tag for BGM pairing ('warm acoustic', 'chill beat', 'cinematic build')
        overlayTimings: Array<{
            text: string             // Hebrew ≤7 words per cue
            startSec: number         // 0-indexed start time
            endSec: number           // stays visible until
            position: OverlayPosition
        }>
    }
}

async function loadBrandBook(instanceId: string, agentId?: string | null): Promise<Record<string, unknown> | null> {
    // Per-agent: a secondary brand has its OWN brand book (agentId-scoped row).
    // Without the agentId filter the loader can return the primary's brand book.
    const rows = await db.select().from(brandBooks).where(
        agentId
            ? and(eq(brandBooks.instanceId, instanceId), eq(brandBooks.agentId, agentId))
            : eq(brandBooks.instanceId, instanceId),
    )
    if (rows.length === 0) return null
    const approved = rows.find(r => r.status === 'approved')
    return (approved || rows.sort((a, b) => (b.version || 0) - (a.version || 0))[0]) as unknown as Record<string, unknown>
}

function hexFromColor(c: any): string | null {
    if (!c) return null
    if (typeof c === 'string') return c
    if (typeof c === 'object' && c.hex) return c.hex
    return null
}

function compactBrandBlock(bb: Record<string, unknown> | null): string {
    if (!bb) return '*(No brand book — use documentary/editorial photography aesthetic. Default palette: warm amber + deep charcoal + cream.)*'
    const colors = (bb.colors as any) || {}
    const logo = (bb.logo as any) || {}
    const imagery = (bb.imagery as any) || {}
    const voice = (bb.voice as any) || {}
    const typography = (bb.typography as any) || {}
    const principles = (bb.principles as any) || []

    // Extract hex codes from the various color shapes (object {hex,name,usage} or string)
    const paletteHexes = [
        hexFromColor(colors.primary),
        hexFromColor(colors.secondary),
        ...(Array.isArray(colors.accent) ? colors.accent.map(hexFromColor) : [hexFromColor(colors.accent)]),
    ].filter(Boolean).slice(0, 5).join(', ')

    // Imagery — prefer the new schema (photographyStyle) and fall back to old (style/dos/donts)
    const photo = (imagery.photographyStyle as any) || {}
    const imageryStyle = photo.primary || imagery.style || imagery.description || imagery.anchor || ''
    const imageryLighting = photo.lightingPreference || ''
    const moodKeywords = Array.isArray(imagery.moodKeywords) ? imagery.moodKeywords.slice(0, 6).join(', ') : ''
    // Support both new (doUse/doNotUse) and legacy (dos/donts) field names
    const doList = imagery.doUse || imagery.dos || []
    const dontList = imagery.doNotUse || imagery.donts || []
    const imageryDo = Array.isArray(doList) ? doList.slice(0, 5).join(' · ') : ''
    const imageryDont = Array.isArray(dontList) ? dontList.slice(0, 5).join(' · ') : ''

    // Voice — tone + personality + vocabulary do/don't
    const voiceTone = voice.tone || voice.description || ''
    const personality = Array.isArray(voice.personalityAdjectives) ? voice.personalityAdjectives.slice(0, 5).join(', ') : ''
    const vocabDo = Array.isArray(voice.vocabularyDo || voice.vocabulary_do) ? (voice.vocabularyDo || voice.vocabulary_do).slice(0, 8).join(', ') : ''
    const vocabDont = Array.isArray(voice.vocabularyDont || voice.vocabulary_dont) ? (voice.vocabularyDont || voice.vocabulary_dont).slice(0, 8).join(', ') : ''
    const hebrewRegister = voice.hebrewRegister || ''

    // Identity — tagline + positioning (surface brand story to the image director)
    const identity = (bb.identity as any) || bb
    const taglineHe = identity.taglineHe || ''
    const positioning = identity.positioningLine || ''

    // Principles — keep as array of strings
    const principleList = Array.isArray(principles) ? principles.slice(0, 3).join(' | ') : (Array.isArray((principles as any).rules) ? (principles as any).rules.slice(0, 3).join(' | ') : '')

    return `**Brand:** ${(bb.businessName || identity.businessName || '')}${taglineHe ? ` — "${taglineHe}"` : ''}
${positioning ? `**Positioning:** ${positioning}\n` : ''}**Palette (hex):** ${paletteHexes || 'not specified'}
**Logo:** ${logo.url || (logo.primary && logo.primary.url) ? 'available' : 'not specified'}
**Imagery:** ${imageryStyle || 'documentary lifestyle, natural light'}${imageryLighting ? ` · lighting: ${imageryLighting}` : ''}${moodKeywords ? ` · mood: ${moodKeywords}` : ''}
${imageryDo ? `**Imagery DO:** ${imageryDo}\n` : ''}${imageryDont ? `**Imagery DON'T:** ${imageryDont}\n` : ''}**Voice & tone:** ${voiceTone || 'professional yet warm'}${personality ? ` · personality: ${personality}` : ''}${hebrewRegister ? ` · Hebrew register: ${hebrewRegister}` : ''}
${vocabDo ? `**Use words:** ${vocabDo}\n` : ''}${vocabDont ? `**Avoid words:** ${vocabDont}\n` : ''}${principleList ? `**Principles:** ${principleList}` : ''}`
}

export async function generateCreativeBrief(
    instanceId: string,
    item: PlanItemContext,
    agentId?: string | null,
): Promise<CreativeBriefOutput | null> {
    const apiKey = await getApiKeyForInstance(instanceId, agentId)
    if (!apiKey) return null

    // Per-agent isolation: read the ACTIVE agent's research_data + brand book,
    // not the instance row (= primary mirror). A secondary brand otherwise
    // generates creatives off the primary agent's research + brand voice.
    let rd: Record<string, unknown> = {}
    if (agentId) {
        const { resolveAgentById, readResearchData } = await import('@/services/agentContext')
        const agent = await resolveAgentById(instanceId, agentId)
        rd = ((await readResearchData(agent, instanceId)) as Record<string, unknown>) || {}
    } else {
        const [instance] = await db.select().from(instances).where(eq(instances.id, instanceId))
        if (!instance) return null
        rd = (instance.researchData as Record<string, unknown> | null) || {}
    }
    const answers = (rd.answers as Record<string, unknown> | null) || {}
    const businessName = (answers.businessName as string) || 'the business'

    const brandBook = await loadBrandBook(instanceId, agentId)
    const brandBlock = compactBrandBlock(brandBook)
    const optBlock = formatLatestOptimizationReport(rd)
    const statsBlock = formatAgentStats(rd, { channel: item.channel, sinceDays: 60 })

    // Video formats need motion + VO + overlay timings in the brief output.
    // Images keep the compact output — Kling/Veo/ElevenLabs aren't called.
    const isVideoFormat = item.type === 'reel' || item.type === 'story' ||
        item.type === 'video' || item.channel === 'youtube' || item.channel === 'tiktok'

    const prompt = `You are a senior creative director at a top-tier ad agency producing the visual for ONE scheduled social/blog/ad item for ${businessName}. Your output is an image prompt + model-selection + overlay plan${isVideoFormat ? ' + motion + voiceover + timed overlays for the video pipeline' : ''}. The pipeline routes this to fal.ai${isVideoFormat ? ' (Flux for first-frame → Kling I2V for motion) + ElevenLabs (Hebrew VO) + FFmpeg (overlay + mux)' : ', downloads the result, composites Hebrew typography post-generation via sharp+SVG'}, and serves from the client's own VPS.

## The content item
- **Hook (Hebrew):** ${item.hook}
- **Brief (Hebrew summary):** ${String(item.brief).substring(0, 1500)}
- **Pillar (strategic theme):** ${item.pillar}
- **Target persona:** ${item.persona}
- **Channel:** ${item.channel}
- **Format:** ${item.type}
- **Product focus:** ${item.productRef || 'mixed'}
- **CTA:** ${item.ctaType || 'none'}

## Brand book (must respect)
${brandBlock}

${optBlock}
${statsBlock}

## 🎬 WRITE LIKE A DIRECTOR OF PHOTOGRAPHY, NOT AI-STOCK

The phrase "clean commercial photography" is an AI-STOCK MAGNET. Every model is trained on stock-labeled photos matching those exact words. Banned.

### ✅ Use documentary/editorial vocabulary:
- **Film stocks:** "Kodak Portra 400", "Fujifilm Superia 400", "Cinestill 800T", "Kodak Gold 200", "Ilford HP5" (B&W)
- **Authenticity markers:** "candid moment", "unposed", "shot on 35mm point-and-shoot", "documentary reportage", "editorial photograph", "street photography", "behind the scenes"
- **Physical artifacts:** "fine organic film grain", "slight halation around highlights", "warm light leak from corner", "natural skin texture with visible pores", "slight motion blur", "uneven focus falloff"
- **Lens + aperture:** "35mm f/2", "50mm f/1.4", "85mm f/1.8 portrait", "28mm wide documentary", "shallow depth of field", "bokeh balls"
- **Light direction:** "morning window side-light", "late afternoon golden hour rim-light", "diffused overcast softbox quality", "single tungsten bulb key with practical", "dappled shadow through blinds"
- **Color grading words:** "muted teal-orange", "warm earth tones", "desaturated editorial", "moody high-contrast", "washed pastel", "cross-processed"

### ❌ Hard bans — NEVER request:
- Dashboards, UI mockups, app screenshots on monitors, floating glass panels
- "Generic modern office desk" with lamp + clock + plant + laptop
- Silhouettes at sunset, diverse team of stock models smiling at laptop
- Glowing holograms, neural networks, brain-with-circuits, data-flow light streams
- Analog clocks, stopwatches, "45 min" numerals rendered literally
- Split-screen before/after panels
- 3D render look, CGI, plastic skin, symmetrical composition
- ANY TEXT IN IMAGE — no letters, numbers, writing, logos with readable text, typography, captions, signs, billboards, book covers, packaging labels. We composite Hebrew typography in code afterward. Image = pure visuals.

## 🎯 Craft ratio — 70/25/5

- **70% mood/emotion/aesthetic** — what feeling hits in 0.3s of scroll?
  Freedom, warmth, tension, craft, pride, quiet confidence, rebellion, patience, grit?
- **25% concrete grounding anchor** — ONE specific real element: a founder's
  hands on a notebook, dust motes in side-light, a plant on a Tel Aviv
  windowsill, an espresso cup on worn wood, morning light on a kitchen wall.
  Make it photographable, not abstract.
- **5% composition/cinematography** — lens, film stock, light direction,
  grain, color grade.

## 🎨 MODEL SELECTION — pick the right fal.ai model for THIS job

Return the BEST model in \`modelHint\`:

- **nano-banana-pro** (Google Gemini 3 Pro Image) — $0.15/image.
  **USE WHEN:** the visual needs Hebrew OR English typography baked in the
  image (handwritten sign on a shop, packaging with brand name, storefront
  signage). Only model with documented Hebrew support. Skip if our post-
  generation overlay can handle it.

- **flux-2-pro** — $0.03/MP. **DEFAULT for ads.** Strongest prompt-following,
  editorial look, natural skin, rich color. Use when no in-image text needed
  and you want a premium photographic feel.

- **seedream-4.5** (ByteDance) — $0.03/image. **USE WHEN:** cinematic,
  wide-aspect hero imagery or stylized/painterly direction. 4K-ready.
  Strong for story cards and blog heroes.

- **ideogram-v3** — $0.03–$0.09. **USE WHEN:** English-heavy poster or
  graphic with typography integral to the design. Skip for Hebrew.

- **flux-pro-1.1** — $0.04/MP. Legacy fallback, avoid unless Flux 2 unavailable.

- **flux-schnell** — $0.003/image. Fast/cheap iteration only; output quality
  lower. Use only when budget mode is on and preview is needed.

## 🔤 Hebrew text overlay — composited by our sharp+SVG layer

If the item's hook works better WITH a visible Hebrew line, return it in
\`overlayText\` (≤7 words) and choose \`overlayPosition\` — top, bottom,
left, or right. Leave composable negative space in that third of the image
(your imagePrompt must explicitly mention "negative space in the [position]
third for typography overlay").

Rules:
- Only short, punchy Hebrew fragments (≤7 words). Long prose goes in caption.
- "none" is valid — if the image carries the message alone, don't force text.
- For nano-banana-pro model: set overlayText='' because it'll render text in-image.
- For all other models: use overlayText + overlayPosition when a headline
  overlay would add value.

## Channel-aware framing

- FB/LinkedIn feed: horizontal 1.91:1, focal point slightly off-center
- IG portrait feed: 4:5, subject upper third
- IG story / Reel cover: 9:16 vertical, high-contrast top third
- Blog hero: 16:9, wide cinematic, strong negative space
- Email hero: 1.91:1, simple single focal point

## OUTPUT — single JSON object, no markdown fences

{
  "imagePrompt": "<English prompt, 70-140 words. Subject-action + setting + time-of-day + light direction + camera/lens + film stock + grain + color grade + mood + negative space spec. NO text requests. Be cinema-specific, not generic.${isVideoFormat ? ' This is the FIRST FRAME of a video — the subject pose must be ready to start a natural motion (handing cup to mouth, turning head, lifting hand, etc.).' : ''}>",
  "negativePrompt": "<60-100 words. Include ALL: text, letters, numbers, writing, typography, logo, caption, watermark, dashboard, UI, screenshot, app interface, phone mockup, generic office desk, stock photo, clock, hologram, 3D render, CGI, plastic skin, symmetrical, plus brand DON'Ts>",
  "styleAnchor": "<6-12 words reusable across iterations — film-stock + mood summary>",
  "modelHint": "flux-2-pro | nano-banana-pro | seedream-4.5 | ideogram-v3 | flux-pro-1.1 | flux-schnell",
  "overlayText": "<Hebrew ≤7 words OR '' when model handles it or none needed>",
  "overlayPosition": "top | bottom | left | right | none",
  "rationale": "<1-2 sentences in Hebrew explaining metaphor/mood/model choice>"${isVideoFormat ? `,
  "video": {
    "motionPrompt": "<English motion description for Kling I2V — 40-80 words. Specify camera movement (breath, pan, push-in), subject action (lifts cup, turns head, types, gestures), environmental motion (steam curls, light shifts, leaves sway). Keep it PHYSICALLY PLAUSIBLE — small documentary movements, not action-movie cuts.>",
    "durationSec": 5 | 10,   // 5 is cheaper ($0.35) and punchier; 10 ($0.70) lets VO breathe
    "voiceScriptHe": "<Hebrew VO text. 1-2 full sentences, 15-40 words. Natural spoken Hebrew — short sentences, no run-ons. Narrate in second person (אתם/אתה/את) matching the persona. The final sentence should plant the CTA intention without reading it verbatim. '' = no voiceover (music-only reel).>",
    "voiceScriptEn": "<OPTIONAL natural English VO, only if the brand's EN audience is relevant.>",
    "voiceStyle": "casual | confident | intimate | energetic | narrator",
    "musicMood": "<2-5 words tag: 'warm acoustic guitar', 'chill lo-fi beat', 'cinematic build', 'morning piano', 'upbeat indie'. Used by audio stage to pick BGM.>",
    "overlayTimings": [
      { "text": "<Hebrew ≤5 words>", "startSec": 0.3, "endSec": 3, "position": "top" },
      { "text": "<optional 2nd beat>", "startSec": 3.5, "endSec": <duration-0.5>, "position": "bottom" }
    ]
  }
` : ''}
}

JSON only, nothing else.`

    const model = await resolveDirectModel(instanceId, 'yotzer')
    const isOpus = model.startsWith('claude-opus')

    const t0 = Date.now()
    try {
        const body: Record<string, unknown> = {
            model,
            max_tokens: 4000,
            messages: [{ role: 'user', content: prompt }],
        }
        if (isOpus) {
            body.thinking = { type: 'adaptive' }
            body.output_config = { effort: 'medium' }
        }
        const res = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(180_000),
        })
        if (!res.ok) {
            console.warn(`[creativeBrief] API ${res.status}:`, (await res.text()).substring(0, 300))
            return null
        }
        const data = await res.json() as { content?: Array<{ type?: string; text?: string }> }
        const blocks = (data.content || []).filter(c => c.type === 'text' && c.text)
        const text = (blocks[blocks.length - 1]?.text || '').trim()
        const firstBrace = text.indexOf('{')
        const lastBrace = text.lastIndexOf('}')
        if (firstBrace < 0 || lastBrace < 0) {
            console.warn('[creativeBrief] no JSON in output:', text.substring(0, 200))
            return null
        }
        const cleaned = text.substring(firstBrace, lastBrace + 1).replace(/,\s*([}\]])/g, '$1')
        const parsed = JSON.parse(cleaned) as Partial<CreativeBriefOutput>
        if (!parsed.imagePrompt) {
            console.warn('[creativeBrief] missing imagePrompt in output')
            return null
        }
        console.log(`[creativeBrief] ${item.id}: brief ready in ${((Date.now() - t0) / 1000).toFixed(1)}s (model=${model}, hint=${parsed.modelHint})`)
        const cost = isOpus ? 0.30 : model.startsWith('claude-sonnet') ? 0.04 : 0.01

        // Hard-ban backstop — always appended even if Opus forgot
        const HARD_NEG = 'text, letters, numbers, writing, typography, lettering, caption, watermark, logo, UI screenshot, dashboard, app interface, monitor display, phone mockup, generic office desk, stock photography look, clock, watch, stopwatch, neural network visualization, glowing hologram, circuit brain, data flow, split-screen, 3d render, cgi, plastic skin, symmetrical composition, deformed hands, extra fingers, low quality, blurry, amateur, oversaturated, HDR overprocessed'
        const mergedNeg = parsed.negativePrompt
            ? `${parsed.negativePrompt}, ${HARD_NEG}`
            : HARD_NEG

        // Validate + normalize modelHint
        const validModels: ModelHint[] = ['flux-2-pro', 'flux-pro-1.1', 'flux-schnell', 'nano-banana-pro', 'seedream-4.5', 'ideogram-v3']
        const modelHint: ModelHint = validModels.includes(parsed.modelHint as ModelHint)
            ? (parsed.modelHint as ModelHint)
            : 'flux-2-pro'

        const validPos: OverlayPosition[] = ['top', 'bottom', 'left', 'right', 'none']
        const overlayPosition: OverlayPosition = validPos.includes(parsed.overlayPosition as OverlayPosition)
            ? (parsed.overlayPosition as OverlayPosition)
            : 'none'

        // Parse optional video block (present only when isVideoFormat was true)
        let videoBlock: CreativeBriefOutput['video']
        const rawVideo = (parsed as any).video
        if (rawVideo && typeof rawVideo === 'object') {
            const dur = rawVideo.durationSec === 10 ? 10 : 5
            const validStyles = ['casual', 'confident', 'intimate', 'energetic', 'narrator']
            const style = validStyles.includes(rawVideo.voiceStyle) ? rawVideo.voiceStyle : 'casual'
            const timings = Array.isArray(rawVideo.overlayTimings)
                ? (rawVideo.overlayTimings as any[])
                    .filter(t => t && typeof t.text === 'string' && typeof t.startSec === 'number')
                    .map(t => ({
                        text: String(t.text).substring(0, 80),
                        startSec: Math.max(0, Math.min(dur, Number(t.startSec))),
                        endSec: Math.max(0, Math.min(dur, Number(t.endSec ?? dur))),
                        position: (validPos.includes(t.position) ? t.position : 'top') as OverlayPosition,
                    }))
                    .slice(0, 4)
                : []
            videoBlock = {
                motionPrompt: String(rawVideo.motionPrompt || ''),
                durationSec: dur as 5 | 10,
                voiceScriptHe: String(rawVideo.voiceScriptHe || '').substring(0, 500),
                voiceScriptEn: rawVideo.voiceScriptEn ? String(rawVideo.voiceScriptEn).substring(0, 500) : undefined,
                voiceStyle: style as NonNullable<CreativeBriefOutput['video']>['voiceStyle'],
                musicMood: String(rawVideo.musicMood || 'warm acoustic'),
                overlayTimings: timings,
            }
        }

        return {
            imagePrompt: String(parsed.imagePrompt),
            negativePrompt: mergedNeg,
            styleAnchor: String(parsed.styleAnchor || 'editorial documentary, Kodak Portra 400, natural light, warm muted palette'),
            rationale: String(parsed.rationale || ''),
            costUsd: cost,
            modelHint,
            overlayText: parsed.overlayText ? String(parsed.overlayText).substring(0, 80) : '',
            overlayPosition,
            video: videoBlock,
        }
    } catch (err) {
        console.warn(`[creativeBrief] ${item.id} error:`, (err as Error).message)
        return null
    }
}