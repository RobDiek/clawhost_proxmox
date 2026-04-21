/**
 * Media Orchestrator — coordinates fal.ai generation → VPS upload → DB row.
 *
 * Phase M.1.3 (this file): image-only MVP path.
 *   generateImagesForPrompt(instanceId, { prompt, channelFormat, numVariants })
 *     → calls fal.ai
 *     → downloads bytes
 *     → uploads to /home/openclaw/.openclaw/media/{YYYY-MM}/{cp_id}/...
 *     → inserts content_plan_media rows with status='ready'
 *     → returns array of { id, publicUrl, costUsd }
 *
 * Phase M.1.4 (next): add Creative Brief Generator that calls Opus to turn a
 *   content plan item into a structured image prompt. This orchestrator is
 *   kept "dumb" — takes the final prompt as input — so the brief gen can
 *   evolve independently.
 *
 * Phase M.2: add generateVideoForPrompt + generateVoiceForScript.
 *
 * Auth: resolves key via resolveMediaKey(instanceId, 'fal') → instance key
 *       from researchData.mediaKeys, fallback to env FAL_KEY.
 */
import { randomBytes } from 'crypto'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { instances, contentPlanMedia } from '@/db/schema'
import { generateImages, type FalImageModel } from './falAI'
import { sshUploadBuffer, fetchBytes } from './sshUpload'
import { generateCreativeBrief, type PlanItemContext } from './creativeBrief'

export interface ChannelFormatSpec {
    channel: string             // 'instagram' | 'facebook' | 'blog' | 'reel' | 'story' | ...
    width: number
    height: number
    aspectRatio: string         // '4:5' | '1:1' | '16:9' | '9:16' etc
    purpose: string             // 'ig-feed' | 'fb-feed' | 'blog-hero' | 'reel-thumb' | ...
}

// Default formats per channel (MVP — can be extended via settings later)
export const DEFAULT_CHANNEL_FORMATS: Record<string, ChannelFormatSpec> = {
    instagram:  { channel: 'instagram',  width: 1080, height: 1350, aspectRatio: '4:5',  purpose: 'ig-feed' },
    facebook:   { channel: 'facebook',   width: 1200, height: 630,  aspectRatio: '1.91:1', purpose: 'fb-feed' },
    linkedin:   { channel: 'linkedin',   width: 1200, height: 627,  aspectRatio: '1.91:1', purpose: 'li-feed' },
    blog:       { channel: 'blog',       width: 1920, height: 1080, aspectRatio: '16:9', purpose: 'blog-hero' },
    email:      { channel: 'email',      width: 600,  height: 315,  aspectRatio: '1.91:1', purpose: 'email-hero' },
    youtube:    { channel: 'youtube',    width: 1280, height: 720,  aspectRatio: '16:9', purpose: 'yt-thumb' },
    // Vertical (for stories/reels when image-only — video comes in M.2)
    story:      { channel: 'instagram',  width: 1080, height: 1920, aspectRatio: '9:16', purpose: 'ig-story' },
    reel:       { channel: 'instagram',  width: 1080, height: 1920, aspectRatio: '9:16', purpose: 'reel-cover' },
    tiktok:     { channel: 'tiktok',     width: 1080, height: 1920, aspectRatio: '9:16', purpose: 'tiktok-cover' },
}

export function resolveChannelFormat(channel: string): ChannelFormatSpec {
    return DEFAULT_CHANNEL_FORMATS[channel] || DEFAULT_CHANNEL_FORMATS.instagram
}

// Resolve fal.ai / ElevenLabs key from standard `instances` columns.
// Reuses the existing creative-integrations schema (falApiKey /
// elevenlabsApiKey) that user onboarding already saves via
// POST /hosting/instances/:id/integrations/creative/save.
// Env vars are fallback for the mgmt-side test instance only.
export async function resolveMediaKey(
    instanceId: string,
    provider: 'fal' | 'elevenlabs',
): Promise<{ key: string; source: 'instance' | 'env' | 'none' }> {
    const [instance] = await db.select().from(instances).where(eq(instances.id, instanceId))
    const instanceKey = provider === 'fal' ? instance?.falApiKey : instance?.elevenlabsApiKey
    if (instanceKey) return { key: instanceKey, source: 'instance' }
    const envKey = provider === 'fal' ? process.env.FAL_KEY : process.env.ELEVENLABS_API_KEY
    if (envKey) return { key: envKey, source: 'env' }
    return { key: '', source: 'none' }
}

function genRenderId(): string {
    return 'cpm_' + randomBytes(6).toString('hex')
}

function genFilename(renderType: string, purpose: string, ext: string): string {
    const short = randomBytes(3).toString('hex')
    return `${renderType}-${purpose}-${short}.${ext}`
}

export interface GenerateImagesOpts {
    contentPlanItemId: string            // "cp_..." — the plan item this media belongs to
    prompt: string                        // final image prompt (Hebrew or English OK for Flux)
    negativePrompt?: string
    channels: string[]                    // ['instagram', 'facebook'] etc
    numVariantsPerChannel?: number        // default 1
    model?: FalImageModel
    brandSnapshot?: unknown               // snapshot of brand book at render time
    styleAnchor?: string
}

export interface GenerateImagesResult {
    renders: Array<{
        id: string
        channel: string
        publicUrl: string
        vpsPath: string
        costUsd: number
        version: number
    }>
    totalCostUsd: number
    failed: Array<{ channel: string; error: string }>
}

export async function generateImagesForContentPlanItem(
    instanceId: string,
    opts: GenerateImagesOpts,
): Promise<GenerateImagesResult> {
    const [instance] = await db.select().from(instances).where(eq(instances.id, instanceId))
    if (!instance) throw new Error('Instance not found')
    if (!instance.ip) throw new Error('Instance has no IP — cannot upload media')
    if (!instance.subdomainAgent) throw new Error('Instance has no agent subdomain — cannot serve media')

    const { key, source } = await resolveMediaKey(instanceId, 'fal')
    if (!key) throw new Error('fal.ai key not configured for this instance and no env fallback')
    if (source === 'env') console.log(`[mediaOrchestrator] ${instanceId}: using env FAL_KEY (fallback)`)

    const renders: GenerateImagesResult['renders'] = []
    const failed: GenerateImagesResult['failed'] = []
    let totalCostUsd = 0

    const numVariants = Math.min(Math.max(opts.numVariantsPerChannel || 1, 1), 4)
    const yearMonth = new Date().toISOString().slice(0, 7) // "2026-04"

    // Generate per channel (different aspect ratios → different fal.ai calls)
    for (const channel of opts.channels) {
        const fmt = resolveChannelFormat(channel)
        try {
            const images = await generateImages({
                apiKey: key,
                prompt: opts.prompt,
                negativePrompt: opts.negativePrompt,
                width: fmt.width,
                height: fmt.height,
                numImages: numVariants,
                model: opts.model,
            })

            // Upload each variant to VPS + save DB row
            for (let i = 0; i < images.length; i++) {
                const img = images[i]
                try {
                    const bytes = await fetchBytes(img.url, { maxBytes: 20 * 1024 * 1024 })
                    const filename = genFilename('image', fmt.purpose, 'jpg')
                    const vpsPath = `/home/openclaw/.openclaw/media/${yearMonth}/${opts.contentPlanItemId}/${filename}`

                    await sshUploadBuffer(
                        { host: instance.ip, password: instance.rootPassword || undefined },
                        vpsPath,
                        bytes,
                    )

                    const publicUrl = `https://${instance.subdomainAgent}/media/${yearMonth}/${opts.contentPlanItemId}/${filename}`
                    const renderId = genRenderId()

                    await db.insert(contentPlanMedia).values({
                        id: renderId,
                        instanceId,
                        contentPlanItemId: opts.contentPlanItemId,
                        renderType: 'image',
                        channel,
                        formatSpec: { ...fmt },
                        model: opts.model || 'flux-pro-1.1',
                        prompt: opts.prompt,
                        negativePrompt: opts.negativePrompt || null,
                        seed: img.seed,
                        brandSnapshot: opts.brandSnapshot as never,
                        styleAnchor: opts.styleAnchor,
                        vpsPath,
                        publicUrl,
                        fileSizeBytes: bytes.length,
                        version: 1,
                        status: 'ready',
                        costUsd: String(img.costUsd),
                        generatedAt: new Date(),
                    })

                    renders.push({
                        id: renderId,
                        channel,
                        publicUrl,
                        vpsPath,
                        costUsd: img.costUsd,
                        version: 1,
                    })
                    totalCostUsd += img.costUsd
                } catch (uploadErr) {
                    console.warn(`[mediaOrchestrator] upload failed for ${channel}[${i}]:`, (uploadErr as Error).message)
                    failed.push({ channel: `${channel}[${i}]`, error: (uploadErr as Error).message })
                }
            }
        } catch (genErr) {
            console.warn(`[mediaOrchestrator] generate failed for ${channel}:`, (genErr as Error).message)
            failed.push({ channel, error: (genErr as Error).message })
        }
    }

    console.log(`[mediaOrchestrator] ${instanceId}/${opts.contentPlanItemId}: ${renders.length} renders, $${totalCostUsd.toFixed(3)}, ${failed.length} failed`)
    return { renders, totalCostUsd, failed }
}

/**
 * High-level entry point used by planDraftRunner and manual "generate media"
 * buttons. Chain: planItem → creativeBrief (Opus thinking) → generateImages
 * (Flux Pro) → SFTP to VPS → DB rows.
 *
 * Returns null if brief generation fails (orchestrator never runs without a
 * valid prompt; this avoids burning fal.ai budget on garbage inputs).
 */
export async function generateMediaForPlanItem(
    instanceId: string,
    item: PlanItemContext,
    opts: {
        channels?: string[]              // default: [item.channel]
        numVariantsPerChannel?: number   // default 3
        model?: FalImageModel            // default flux-pro-1.1
    } = {},
): Promise<(GenerateImagesResult & { briefRationale?: string; briefCostUsd?: number }) | null> {
    const channels = opts.channels && opts.channels.length > 0 ? opts.channels : [item.channel]
    const variants = opts.numVariantsPerChannel ?? 3
    const model = opts.model ?? 'flux-pro-1.1'

    // Pass 1: Creative brief
    const brief = await generateCreativeBrief(instanceId, item)
    if (!brief) {
        console.warn(`[mediaOrchestrator] ${item.id}: brief generation failed; skipping`)
        return null
    }

    // Pass 2: Compose final prompt (brief + styleAnchor + optional overlay instruction)
    const overlayFragment = brief.textOverlayHe
        ? ` In-image Hebrew typography overlay: "${brief.textOverlayHe}" — large, bold, legible, brand-colored, top or bottom third depending on composition.`
        : ''
    const finalPrompt = `${brief.imagePrompt} Style anchor: ${brief.styleAnchor}.${overlayFragment}`

    const genResult = await generateImagesForContentPlanItem(instanceId, {
        contentPlanItemId: item.id,
        prompt: finalPrompt,
        negativePrompt: brief.negativePrompt,
        channels,
        numVariantsPerChannel: variants,
        model,
        styleAnchor: brief.styleAnchor,
    })

    return {
        ...genResult,
        totalCostUsd: genResult.totalCostUsd + brief.costUsd,
        briefRationale: brief.rationale,
        briefCostUsd: brief.costUsd,
    }
}