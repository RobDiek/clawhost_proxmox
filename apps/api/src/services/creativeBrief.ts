/**
 * Creative Brief Generator (Phase M.1.4)
 *
 * Reads a content plan item (hook, pillar, persona, channel, type) +
 * current brand book + latest optimization report + historical stats, then
 * uses Opus 4.7 (thinking) to output a structured creative brief:
 *   - One image prompt per requested channel (Flux Pro-optimized English,
 *     because Flux text fidelity is much stronger in English even when the
 *     final in-image text is Hebrew).
 *   - Optional Hebrew text-overlay string(s) (hook fragments embedded in
 *     the image itself — Flux 1.1 renders Hebrew typography well).
 *   - A "style anchor" that keeps visual identity consistent across
 *     iterations without a full LoRA.
 *   - negative_prompt for things to avoid.
 *
 * This is the "thinking" layer. The orchestrator (mediaOrchestrator) is
 * kept dumb and just consumes a prompt — so this generator can evolve
 * independently.
 *
 * Called from planDraftRunner (M.1.6) after the text draft is ready.
 */
import { eq } from 'drizzle-orm'
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

export interface CreativeBriefOutput {
    // Main English prompt for Flux Pro 1.1 — channel/format-agnostic
    // (orchestrator will pass specific dimensions).
    imagePrompt: string
    // Negative prompt (things to avoid). Always includes brand red-flags +
    // the aggressive anti-cliche + no-text bans.
    negativePrompt: string
    // Compact style anchor string — few brand-defining adjectives. Reused
    // across iterations so re-generations keep visual identity.
    styleAnchor: string
    // Why this creative direction (for dashboard + debugging; not sent to fal).
    rationale: string
    // Cost estimate for logging
    costUsd: number
}

// Resolve current approved brand book (or latest draft if none approved).
async function loadBrandBook(instanceId: string): Promise<Record<string, unknown> | null> {
    const rows = await db.select().from(brandBooks).where(eq(brandBooks.instanceId, instanceId))
    if (rows.length === 0) return null
    const approved = rows.find(r => r.status === 'approved')
    return (approved || rows.sort((a, b) => (b.version || 0) - (a.version || 0))[0]) as unknown as Record<string, unknown>
}

function compactBrandBlock(bb: Record<string, unknown> | null): string {
    if (!bb) return '*(No brand book — use clean, professional commercial photography aesthetic.)*'
    const colors = (bb.colors as any) || {}
    const logo = (bb.logo as any) || {}
    const imagery = (bb.imagery as any) || {}
    const voice = (bb.voice as any) || {}
    const principles = (bb.principles as any) || {}

    const palette = [colors.primary, colors.secondary, colors.accent, ...(Array.isArray(colors.palette) ? colors.palette : [])]
        .filter(Boolean).slice(0, 5).join(', ')
    const imageryStyle = imagery.style || imagery.description || imagery.anchor || ''
    const imageryDo = Array.isArray(imagery.dos) ? imagery.dos.join(' · ') : ''
    const imageryDont = Array.isArray(imagery.donts) ? imagery.donts.join(' · ') : ''
    const voiceTone = voice.tone || voice.description || ''
    const principleList = Array.isArray(principles.rules) ? principles.rules.slice(0, 3).join(' | ') : ''

    return `**Brand name:** ${bb.businessName || ''}
**Palette (hex):** ${palette || 'not specified'}
**Logo:** ${logo.url ? `available at ${logo.url}` : 'not specified'}
**Imagery style:** ${imageryStyle || 'clean, professional'}
${imageryDo ? `**Imagery DO:** ${imageryDo}\n` : ''}${imageryDont ? `**Imagery DON'T:** ${imageryDont}\n` : ''}**Tone of voice:** ${voiceTone || 'professional, friendly'}
${principleList ? `**Brand principles:** ${principleList}` : ''}`
}

export async function generateCreativeBrief(
    instanceId: string,
    item: PlanItemContext,
): Promise<CreativeBriefOutput | null> {
    const apiKey = await getApiKeyForInstance(instanceId)
    if (!apiKey) return null

    const [instance] = await db.select().from(instances).where(eq(instances.id, instanceId))
    if (!instance) return null
    const rd = (instance.researchData as Record<string, unknown> | null) || {}
    const answers = (rd.answers as Record<string, unknown> | null) || {}
    const businessName = (answers.businessName as string) || 'the business'

    const brandBook = await loadBrandBook(instanceId)
    const brandBlock = compactBrandBlock(brandBook)
    const optBlock = formatLatestOptimizationReport(rd)
    const statsBlock = formatAgentStats(rd, { channel: item.channel, sinceDays: 60 })

    const prompt = `You are a senior creative director for ${businessName}. Produce a high-quality image prompt for Flux Pro 1.1 that will be used as the visual for one scheduled content item.

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

## 🚫 HARD BANS — do not request any of these
Flux Pro (and every text-to-image model in 2026) fails hard on these. If your
prompt produces any of these, the generation is rejected:

1. **NO TEXT IN THE IMAGE.** No letters, no numbers, no words, no typography
   overlays, no logos with readable text, no UI screenshots with captions,
   no billboards, no signs, no book covers. Hebrew in particular renders
   as garbage. Even English text like "APPROVE" comes out as "APPRO/XW".
   Our system embeds actual Hebrew typography via a post-processing layer —
   the IMAGE must be clean visual content only.
2. **NO AI-STOCK CLICHÉS.** Specifically BANNED:
   - Dashboards / UI mockups / app screenshots on a monitor
   - Desk scenes with lamp + clock + monitor + plant
   - Person in silhouette at sunset looking at horizon
   - Glowing hologram / futuristic neural network / brain with circuits
   - "Data flowing" abstract light streams
   - Diverse team of stock models smiling at laptop
   - Analog clock emphasizing "time saved"
   - Split-screen "before/after" literal comparisons
3. **NO LITERAL DATA VISUALIZATION.** The hook mentions numbers or concepts
   ("45 min vs 2 min") — your image should NOT literally render those
   numbers or show a stopwatch. Communicate the FEELING instead.

## ✅ What makes a strong visual — aim for this
Real marketing imagery works on emotion, metaphor, and aesthetic, not on
literal depiction. Think like a creative director at a top agency:

- **70% mood / emotion / aesthetic** — what feeling does the reader get
  in the first 0.3 seconds of scroll? Freedom, tension, warmth, craft,
  pride, quiet confidence?
- **25% concrete human / object anchor** — one real element that grounds
  the metaphor. A hand, a plant, a coffee cup, a street corner, morning
  light on a wall, a founder's workspace (real, not stock-desk).
- **5% composition / cinematography** — specific camera angle, depth of
  field, lighting direction, film grain aesthetic.

### Good example (for a "45 min saved on automation" story)
- ❌ Bad: "dashboard on monitor showing 45 min counter on wooden desk"
- ✅ Good: "close-up of a woman's hands holding a warm ceramic coffee cup,
  morning sunlight streaming through a kitchen window, soft bokeh of
  green plants behind, 35mm film aesthetic, cinematic color grading,
  warm honey and sage palette, deep calm, unrushed — she has time"

### Good example (for "ClawFlow completes your stack" story)
- ❌ Bad: "modern workspace with multiple monitors showing integration icons"
- ✅ Good: "overhead flat-lay of an artisan's workbench with well-loved
  hand tools arranged around a single new precision tool, natural wood
  grain, dust motes in side-light, cinematic shadow, muted sage and
  terracotta palette — craft, integration, belonging"

## Channel-specific framing hints
- Feed (FB/LinkedIn): horizontal or square, focal point slightly off-center
- IG portrait: vertical composition, subject in upper third
- Reel cover: high-contrast, face or object dominates frame
- Blog hero: wide cinematic, negative space for headline overlay (we add it)

## Output — single JSON object, no markdown fences, no textOverlayHe field
{
  "imagePrompt": "<English Flux Pro prompt — 60-120 words. Follow the 70/25/5 ratio. NO text requests. NO UI mockups. NO clichés above.>",
  "negativePrompt": "<60-90 words. ALWAYS include: text, letters, numbers, writing, typography, UI screenshot, dashboard, app interface, monitor display, generic office desk, stock photography, clock, watch, stopwatch, blurry, low quality, watermark, deformed, amateur. Add brand DON'Ts on top.>",
  "styleAnchor": "<6-12 word visual style summary — reused across iterations for consistency>",
  "rationale": "<1-2 sentences in Hebrew — WHY this metaphor/mood fits the hook and persona>"
}

Return JSON only, nothing else.`

    // Resolve the model per user's sub-agent config. Creative brief is
    // Yotzer's domain — he's the creative director. User can upgrade to Opus
    // in Settings → תת-סוכנים if they want richer visuals.
    const model = await resolveDirectModel(instanceId, 'yotzer')
    const isOpus = model.startsWith('claude-opus')

    const t0 = Date.now()
    try {
        const body: Record<string, unknown> = {
            model,
            max_tokens: 4000,
            messages: [{ role: 'user', content: prompt }],
        }
        // Opus 4.7 benefits from adaptive thinking — worth the extra latency
        // for creative direction. Sonnet/Haiku don't support the same shape.
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
        console.log(`[creativeBrief] ${item.id}: brief ready in ${((Date.now() - t0) / 1000).toFixed(1)}s (model=${model})`)
        // Rough per-model cost estimate for budget tracking
        const cost = isOpus ? 0.30 : model.startsWith('claude-sonnet') ? 0.04 : 0.01
        // Backstop: always append our hard-ban list to the negative prompt, even
        // if Opus forgot. Flux 1.1 reliably respects these when listed explicitly.
        const HARD_NEG = 'text, letters, numbers, writing, typography, lettering, caption, watermark, UI screenshot, dashboard, app interface, monitor display, phone mockup, generic office desk, stock photography look, clock, watch, stopwatch, neural network visualization, glowing hologram, deformed hands, extra fingers, low quality, blurry, amateur'
        const mergedNeg = parsed.negativePrompt
            ? `${parsed.negativePrompt}, ${HARD_NEG}`
            : HARD_NEG

        return {
            imagePrompt: String(parsed.imagePrompt),
            negativePrompt: mergedNeg,
            styleAnchor: String(parsed.styleAnchor || 'cinematic lifestyle photography, natural light, warm muted palette, subtle film grain'),
            rationale: String(parsed.rationale || ''),
            costUsd: cost,
        }
    } catch (err) {
        console.warn(`[creativeBrief] ${item.id} error:`, (err as Error).message)
        return null
    }
}