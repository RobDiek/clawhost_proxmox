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
import { getApiKeyForInstance, formatLatestOptimizationReport, formatAgentStats } from '@/controllers/hosting/agentSetup'

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
    // Negative prompt (things to avoid). Always includes brand red-flags.
    negativePrompt: string
    // Compact style anchor string — few brand-defining adjectives. Reused
    // across iterations so re-generations keep visual identity.
    styleAnchor: string
    // Optional Hebrew text overlays to bake INTO the image (hook fragment).
    // Flux 1.1 renders Hebrew; keep short (≤6 words) for legibility.
    textOverlayHe?: string
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

## How Flux Pro 1.1 works best
- English prompts give much stronger subject + composition accuracy (even when the in-image text is Hebrew).
- It renders Hebrew typography well in the \`textOverlayHe\` field — keep it ≤6 words and visually dominant.
- Describe the scene concretely (subject, setting, lighting, mood, camera angle, depth). Avoid vague adjectives.
- Prefer photographic realism unless the brand's imagery style is explicitly illustrative.
- Always include a style anchor so iterations stay consistent.
- Never include people's faces unless the brand explicitly allows portraits.

## Critical rules
- Respect brand imagery DO/DON'T from the brand book verbatim.
- Hebrew overlay text must pass a simple test: would a native Hebrew reader recognize the phrase in 1 second?
- If channel is ${item.channel}, optimize for that aspect ratio's typical framing (feed square/portrait, reel vertical, blog horizontal).
- Do not request text in English on the image — if there's overlay, use the Hebrew field.

## Output — single JSON object, no markdown fences
{
  "imagePrompt": "<English Flux Pro prompt — subject, setting, lighting, mood, composition, camera, depth, ~60-120 words>",
  "negativePrompt": "<things to avoid — brand-violating elements, common Flux artifacts, anything from imagery DON'Ts, 30-60 words>",
  "styleAnchor": "<6-12 word visual style summary — reused across iterations>",
  "textOverlayHe": "<≤6 Hebrew words for in-image text, OR empty string if the image should have no text overlay>",
  "rationale": "<1-2 sentence Hebrew explanation of why this visual direction>"
}

Return JSON only, nothing else.`

    const t0 = Date.now()
    try {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
                model: 'claude-opus-4-7',
                max_tokens: 4000,
                thinking: { type: 'adaptive' },
                output_config: { effort: 'medium' },
                messages: [{ role: 'user', content: prompt }],
            }),
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
        console.log(`[creativeBrief] ${item.id}: brief ready in ${((Date.now() - t0) / 1000).toFixed(1)}s`)
        return {
            imagePrompt: String(parsed.imagePrompt),
            negativePrompt: String(parsed.negativePrompt || 'blurry, low quality, watermark, text artifacts, distorted text, extra fingers, deformed, amateur'),
            styleAnchor: String(parsed.styleAnchor || 'clean professional commercial photography'),
            textOverlayHe: parsed.textOverlayHe ? String(parsed.textOverlayHe) : undefined,
            rationale: String(parsed.rationale || ''),
            costUsd: 0.30, // rough Opus thinking estimate
        }
    } catch (err) {
        console.warn(`[creativeBrief] ${item.id} error:`, (err as Error).message)
        return null
    }
}