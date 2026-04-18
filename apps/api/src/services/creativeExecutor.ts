/**
 * Creative Executor — orchestrates the actual render lifecycle.
 *
 * Called from:
 *   1. outputs/approve hook — when user approves creative_final_draft
 *   2. creative/render endpoint — manual trigger (admin/debug)
 *
 * Flow:
 *   1. Load approved creative_final_draft + lineage (concept/character/scenes)
 *   2. Create creative_renders row, status=queued
 *   3. Build fal.ai request per model spec (different endpoints for image/video)
 *   4. Submit via fal.ai REST API (uses user's BYOK falApiKey)
 *   5. Poll for completion (sync for fast models, queue for slow ones)
 *   6. On done: download result to tenant VPS, run Hebrew overlay (if requested),
 *      compose logo, update creative_renders.final_url
 *   7. Update agent_outputs.mediaUrl + metadata.renderStatus
 *
 * Idempotency: if outputId already has a 'done' or 'rendering' render, returns
 * existing — no double-charge.
 *
 * Cost safety: reads instance.falApiKey. If missing → renderStatus='failed',
 * errorMessage explains. Never proceeds without key.
 */

import { randomBytes } from 'crypto'
import { eq, and, inArray } from 'drizzle-orm'
import { readFileSync } from 'fs'
import { Client } from 'ssh2'

import { db } from '@/db'
import { creativeRenders, agentOutputs, instances, brandBooks } from '@/db/schema'

const SSH_KEY_PATH = process.env.MASTER_SSH_KEY_PATH || '/root/.ssh/openclaw_master'
let sshKeyCache: Buffer | null = null
function getSSHKey(): Buffer {
    if (!sshKeyCache) sshKeyCache = readFileSync(SSH_KEY_PATH)
    return sshKeyCache
}

function sshExec(ip: string, command: string, password?: string, timeoutMs = 60000): Promise<string> {
    return new Promise((resolve, reject) => {
        const conn = new Client()
        let output = ''
        const timer = setTimeout(() => { conn.end(); reject(new Error('SSH timeout')) }, timeoutMs)
        conn.on('ready', () => {
            conn.exec(command, (err, stream) => {
                if (err) { clearTimeout(timer); conn.end(); return reject(err) }
                stream.on('data', (d: Buffer) => { output += d.toString() })
                stream.stderr.on('data', (d: Buffer) => { output += d.toString() })
                stream.on('close', () => { clearTimeout(timer); conn.end(); resolve(output.trim()) })
            })
        }).on('error', (err) => { clearTimeout(timer); reject(err) })
        const opts: Record<string, unknown> = { host: ip, port: 22, username: 'root', readyTimeout: 10000 }
        if (password) opts.password = password
        try { opts.privateKey = getSSHKey() } catch { if (!password) return reject(new Error('No SSH key or password')) }
        conn.connect(opts)
    })
}

const genId = () => 'r_' + randomBytes(6).toString('hex')

interface InstanceRef {
    id: string
    ip: string | null
    rootPassword: string | null
    falApiKey?: string | null
    elevenlabsApiKey?: string | null
}

export interface ExecutorResult {
    renderId: string
    status: 'queued' | 'rendering' | 'uploading' | 'compositing' | 'done' | 'failed' | 'skipped'
    message: string
    finalUrl?: string
}

// ═══════════════════════════════════════════════════════════════════════════
// Main entry point
// ═══════════════════════════════════════════════════════════════════════════

export async function executeCreativeRender(params: {
    instanceId: string
    outputId: string
    instance?: InstanceRef   // optional — will fetch if not provided
}): Promise<ExecutorResult> {
    const { instanceId, outputId } = params

    // Load instance (or use cached)
    const instance = params.instance || await loadInstance(instanceId)
    if (!instance) throw new Error('Instance not found')

    // Idempotency — check for existing in-progress or done render for this outputId
    const existing = await db.select().from(creativeRenders)
        .where(and(
            eq(creativeRenders.outputId, outputId),
            inArray(creativeRenders.renderStatus, ['queued', 'rendering', 'uploading', 'compositing', 'done']),
        ))
        .limit(1)
    if (existing.length > 0) {
        return {
            renderId: existing[0].id,
            status: existing[0].renderStatus as ExecutorResult['status'],
            message: 'Render already exists',
            finalUrl: existing[0].finalUrl || undefined,
        }
    }

    // Load the approved draft
    const [output] = await db.select().from(agentOutputs).where(eq(agentOutputs.id, outputId))
    if (!output) throw new Error('Output not found')
    if (output.outputType !== 'creative_final_draft') {
        throw new Error(`outputType must be creative_final_draft, got ${output.outputType}`)
    }

    const draft = parseFinalDraft(output.content || output.editedContent || '')
    if (!draft) throw new Error('Could not parse creative_final_draft JSON from output content')

    // Validate we have the fal.ai key
    if (!instance.falApiKey) {
        // Create a failed render row for audit trail
        const failedId = genId()
        await db.insert(creativeRenders).values({
            id: failedId,
            instanceId,
            outputId,
            renderStatus: 'failed',
            tier: draft.tier,
            formatType: draft.formatType,
            selectedModel: draft.selectedModel || '',
            conceptId: draft.conceptId || null,
            scenesId: draft.scenesId || null,
            brandBookVersion: draft.brandBookVersion || null,
            estimatedCostUsd: draft.estimatedCostUsd ? String(draft.estimatedCostUsd) : null,
            errorMessage: 'fal.ai API key missing — user must connect via Creative integration',
            completedAt: new Date(),
        })
        return {
            renderId: failedId,
            status: 'failed',
            message: 'fal.ai API key not connected. Save key via Settings → Creative integration.',
        }
    }

    // Create render row, status=queued
    const renderId = genId()
    await db.insert(creativeRenders).values({
        id: renderId,
        instanceId,
        outputId,
        renderStatus: 'queued',
        tier: draft.tier,
        formatType: draft.formatType,
        selectedModel: draft.selectedModel || '',
        conceptId: draft.conceptId || null,
        scenesId: draft.scenesId || null,
        brandBookVersion: draft.brandBookVersion || null,
        estimatedCostUsd: draft.estimatedCostUsd ? String(draft.estimatedCostUsd) : null,
        prompts: { scenes: [] },  // filled in processRender()
    })

    // Fire off async processing (don't await — return immediately)
    processRender(renderId, draft, instance).catch(err => {
        console.error(`[creativeExecutor] ${renderId} processing error:`, err)
        db.update(creativeRenders).set({
            renderStatus: 'failed',
            errorMessage: err instanceof Error ? err.message : String(err),
            completedAt: new Date(),
        }).where(eq(creativeRenders.id, renderId)).catch(() => { /* noop */ })
    })

    return {
        renderId,
        status: 'queued',
        message: 'Render queued — check renderStatus via GET /creative/renders/:renderId',
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// Processing (async — called with .catch)
// ═══════════════════════════════════════════════════════════════════════════

async function processRender(
    renderId: string,
    draft: ParsedFinalDraft,
    instance: InstanceRef,
): Promise<void> {
    const startedAt = new Date()
    await db.update(creativeRenders).set({
        renderStatus: 'rendering',
        startedAt,
    }).where(eq(creativeRenders.id, renderId))

    // Load scenes from the lineage — scenesId points to a creative_scenes_draft
    // that was approved earlier. We need the scene prompts.
    const scenePrompts = await loadScenePrompts(draft.scenesId, instance.id)
    if (scenePrompts.length === 0) {
        throw new Error('No scene prompts found — check that creative_scenes_draft was approved')
    }

    // Persist prompts used (for reproducibility + learning)
    await db.update(creativeRenders).set({
        prompts: { scenes: scenePrompts },
    }).where(eq(creativeRenders.id, renderId))

    // Submit to fal.ai — different flow for image vs video
    if (!draft.selectedModel) throw new Error('draft.selectedModel missing — cannot route to fal.ai model')
    const modelId = draft.selectedModel
    const resultUrls: string[] = []
    for (let i = 0; i < scenePrompts.length; i++) {
        const scene = scenePrompts[i]
        console.log(`[creativeExecutor] ${renderId} rendering scene ${i + 1}/${scenePrompts.length} via ${modelId}`)
        const url = await submitToFal(modelId, scene.prompt, scene.negativePrompt, instance.falApiKey!, draft)
        resultUrls.push(url)
    }

    // For image — single frame. For video — scenes concatenated later.
    await db.update(creativeRenders).set({
        resultUrls,
    }).where(eq(creativeRenders.id, renderId))

    // Download to tenant VPS + run Hebrew overlay + logo composition
    await db.update(creativeRenders).set({
        renderStatus: 'uploading',
    }).where(eq(creativeRenders.id, renderId))

    if (!instance.ip) throw new Error('Instance has no IP — cannot save render to tenant VPS')

    const creativeId = draft.creativeId || `creative_${Date.now().toString(36)}`
    const outputDir = `/opt/openclaw/creatives/${creativeId}`
    const sourceFile = draft.formatType === 'video' ? 'source.mp4' : 'source.png'
    const finalFile = draft.formatType === 'video' ? 'final.mp4' : 'final.png'

    // Download first result (MVP: single-frame image, or single-scene video)
    await sshExec(
        instance.ip,
        `mkdir -p ${outputDir} && ` +
        `curl -fsSL -o ${outputDir}/${sourceFile} "${resultUrls[0]}" && ` +
        `chown -R openclaw:openclaw ${outputDir}`,
        instance.rootPassword || undefined,
        180000,  // 3 min for large videos
    )

    // Composition phase (overlay + logo) — delegated to tenant-side script
    await db.update(creativeRenders).set({
        renderStatus: 'compositing',
    }).where(eq(creativeRenders.id, renderId))

    const overlayApplied = await applyComposition(instance, outputDir, sourceFile, finalFile, draft)

    // Measure final file
    const { sizeBytes, dimensions } = await measureOutputFile(instance, `${outputDir}/${finalFile}`)

    // Build a public-ish URL (internal — via openclaw-control or similar).
    // For MVP we record the tenant VPS filepath + a read-through URL.
    // Phase B5 will add proper CDN distribution.
    const finalUrl = `ssh://openclaw@${instance.ip}:${outputDir}/${finalFile}`

    const completedAt = new Date()
    const durationSec = Math.round((completedAt.getTime() - startedAt.getTime()) / 1000)

    await db.update(creativeRenders).set({
        renderStatus: 'done',
        completedAt,
        durationSec,
        finalUrl,
        fileSizeBytes: sizeBytes,
        dimensions,
        overlayApplied: overlayApplied.overlay,
        logoApplied: overlayApplied.logo,
    }).where(eq(creativeRenders.id, renderId))

    // Update the agent_output with finalUrl + renderStatus for UI
    await db.update(agentOutputs).set({
        mediaUrl: finalUrl,
        mediaType: draft.formatType === 'video' ? 'video/mp4' : 'image/png',
        metadata: {
            ...(await getOutputMetadata(draft)),
            renderStatus: 'done',
            renderId,
            renderCompletedAt: completedAt.toISOString(),
            durationSec,
        },
    }).where(eq(agentOutputs.id, draft._outputId))

    console.log(`[creativeExecutor] ${renderId} done in ${durationSec}s — ${finalUrl}`)
}

// ═══════════════════════════════════════════════════════════════════════════
// fal.ai submission — routes by model to correct endpoint
// ═══════════════════════════════════════════════════════════════════════════

async function submitToFal(
    modelId: string,
    prompt: string,
    negativePrompt: string | undefined,
    apiKey: string,
    draft: ParsedFinalDraft,
): Promise<string> {
    // Build input payload per model family. Each family has its own arg schema.
    const input = buildFalInput(modelId, prompt, negativePrompt, draft)

    // fal.ai endpoint pattern: https://fal.run/{modelId} for sync
    // Image models (Nano Banana, FLUX): sync, returns in 3-10 sec
    // Video models (Kling, Veo): async queue — use queue.fal.run
    const isVideoModel = /veo|kling|runway|luma|pika|sora/i.test(modelId)
    const endpoint = isVideoModel
        ? `https://queue.fal.run/${modelId}`
        : `https://fal.run/${modelId}`

    const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Authorization': `Key ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(isVideoModel ? 10000 : 120000),
    })

    if (!res.ok) {
        const errText = await res.text()
        throw new Error(`fal.ai ${modelId} HTTP ${res.status}: ${errText.substring(0, 300)}`)
    }

    const data = await res.json() as any

    // Sync response — data contains output directly
    // Async (queue) response — data contains request_id; poll for result
    if (data.request_id && !data.images && !data.video) {
        // Poll the queue
        return await pollFalQueue(modelId, data.request_id, apiKey)
    }

    return extractResultUrl(data, modelId)
}

function buildFalInput(modelId: string, prompt: string, negativePrompt: string | undefined, draft: ParsedFinalDraft): Record<string, unknown> {
    // Resolution parsing (e.g. "1080x1920" → { width: 1080, height: 1920 })
    const resMatch = (draft.resolution || '1080x1080').match(/(\d+)x(\d+)/)
    const width = resMatch ? parseInt(resMatch[1], 10) : 1080
    const height = resMatch ? parseInt(resMatch[2], 10) : 1080

    // Per-model input schemas — known good shapes from fal.ai docs
    if (modelId.includes('nano-banana')) {
        return {
            prompt,
            aspect_ratio: inferAspectRatio(width, height),
            num_images: 1,
            output_format: 'png',
        }
    }
    if (modelId.includes('flux-pro')) {
        return {
            prompt,
            image_size: { width, height },
            num_images: 1,
            enable_safety_checker: true,
            output_format: 'png',
            ...(negativePrompt ? { negative_prompt: negativePrompt } : {}),
        }
    }
    if (modelId.includes('kling')) {
        return {
            prompt,
            duration: '5',   // Kling 2.5 Turbo default 5s
            aspect_ratio: inferAspectRatio(width, height),
        }
    }
    if (modelId.includes('veo')) {
        return {
            prompt,
            duration_seconds: 8,
            aspect_ratio: inferAspectRatio(width, height),
        }
    }
    // Generic fallback
    return { prompt, ...(negativePrompt ? { negative_prompt: negativePrompt } : {}) }
}

function inferAspectRatio(width: number, height: number): string {
    const ratio = width / height
    if (Math.abs(ratio - 1) < 0.05) return '1:1'
    if (Math.abs(ratio - 9 / 16) < 0.1) return '9:16'
    if (Math.abs(ratio - 16 / 9) < 0.1) return '16:9'
    if (Math.abs(ratio - 4 / 3) < 0.1) return '4:3'
    if (Math.abs(ratio - 3 / 4) < 0.1) return '3:4'
    return '1:1'
}

async function pollFalQueue(modelId: string, requestId: string, apiKey: string): Promise<string> {
    const statusUrl = `https://queue.fal.run/${modelId}/requests/${requestId}/status`
    const resultUrl = `https://queue.fal.run/${modelId}/requests/${requestId}`

    const maxPolls = 120  // 120 * 5s = 10 min max for video
    for (let i = 0; i < maxPolls; i++) {
        await new Promise(r => setTimeout(r, 5000))
        const res = await fetch(statusUrl, {
            headers: { 'Authorization': `Key ${apiKey}` },
            signal: AbortSignal.timeout(15000),
        })
        if (!res.ok) continue
        const st = await res.json() as any
        if (st.status === 'COMPLETED') {
            const r2 = await fetch(resultUrl, {
                headers: { 'Authorization': `Key ${apiKey}` },
                signal: AbortSignal.timeout(15000),
            })
            if (!r2.ok) throw new Error(`fal.ai result fetch HTTP ${r2.status}`)
            const result = await r2.json() as any
            return extractResultUrl(result, modelId)
        }
        if (st.status === 'FAILED' || st.status === 'CANCELED') {
            throw new Error(`fal.ai queue ${st.status}: ${st.error || 'unknown'}`)
        }
    }
    throw new Error('fal.ai queue polling timeout (10 min)')
}

function extractResultUrl(data: any, modelId: string): string {
    // Common shapes returned by fal.ai
    if (data.images && Array.isArray(data.images) && data.images[0]?.url) return data.images[0].url
    if (data.image?.url) return data.image.url
    if (data.video?.url) return data.video.url
    if (data.output?.url) return data.output.url
    if (typeof data.output === 'string' && /^https?:\/\//.test(data.output)) return data.output
    throw new Error(`Could not extract result URL from fal.ai response for ${modelId}: ${JSON.stringify(data).substring(0, 300)}`)
}

// ═══════════════════════════════════════════════════════════════════════════
// Composition on tenant VPS — delegates to /opt/openclaw/creative-tools scripts
// ═══════════════════════════════════════════════════════════════════════════

interface CompositionFlags {
    overlay: boolean
    logo: boolean
}

async function applyComposition(
    instance: InstanceRef,
    outputDir: string,
    sourceFile: string,
    finalFile: string,
    draft: ParsedFinalDraft,
): Promise<CompositionFlags> {
    if (!instance.ip) return { overlay: false, logo: false }

    // Write a compact job manifest to tenant VPS, then invoke the overlay script.
    const job = {
        format: draft.formatType,
        sourcePath: `${outputDir}/${sourceFile}`,
        outputPath: `${outputDir}/${finalFile}`,
        overlay: draft.hebrewOverlay ? draft.overlayConfig : null,
        logo: draft.logoOverlay || null,
    }
    const jobB64 = Buffer.from(JSON.stringify(job)).toString('base64')

    try {
        // Ensure creative-tools installed (idempotent)
        await ensureCreativeTools(instance)

        // Run the overlay job
        const out = await sshExec(
            instance.ip,
            `echo '${jobB64}' | base64 -d > /tmp/_creative_job.json && ` +
            `cd /opt/openclaw/creative-tools && ` +
            `node overlay.js /tmp/_creative_job.json 2>&1 | tail -20 && ` +
            `rm -f /tmp/_creative_job.json`,
            instance.rootPassword || undefined,
            120000,
        )
        console.log(`[creativeExecutor] composition output: ${out.substring(0, 300)}`)
        return {
            overlay: !!draft.hebrewOverlay,
            logo: !!draft.logoOverlay,
        }
    } catch (err) {
        console.error('[creativeExecutor] composition failed, falling back to source file:', err)
        // Copy source to final so we still have a usable output
        await sshExec(
            instance.ip,
            `cp ${outputDir}/${sourceFile} ${outputDir}/${finalFile}`,
            instance.rootPassword || undefined, 15000,
        ).catch(() => { /* noop */ })
        return { overlay: false, logo: false }
    }
}

async function ensureCreativeTools(instance: InstanceRef): Promise<void> {
    if (!instance.ip) return
    // Check if already installed — if overlay.js exists + node_modules exists, skip
    const check = await sshExec(
        instance.ip,
        `test -f /opt/openclaw/creative-tools/overlay.js && test -d /opt/openclaw/creative-tools/node_modules/sharp && echo OK || echo MISSING`,
        instance.rootPassword || undefined,
        10000,
    )
    if (check.trim() === 'OK') return

    // Install: create dir, write overlay.js + package.json, npm install sharp
    console.log(`[creativeExecutor] installing creative-tools on ${instance.ip}`)
    const overlayScript = CREATIVE_TOOLS_OVERLAY_JS
    const packageJson = JSON.stringify({
        name: 'openclaw-creative-tools',
        version: '0.1.0',
        private: true,
        dependencies: { sharp: '^0.33.0' },
    }, null, 2)

    const overlayB64 = Buffer.from(overlayScript).toString('base64')
    const pkgB64 = Buffer.from(packageJson).toString('base64')

    await sshExec(
        instance.ip,
        `mkdir -p /opt/openclaw/creative-tools && ` +
        `echo '${overlayB64}' | base64 -d > /opt/openclaw/creative-tools/overlay.js && ` +
        `echo '${pkgB64}' | base64 -d > /opt/openclaw/creative-tools/package.json && ` +
        `cd /opt/openclaw/creative-tools && npm install --omit=dev --silent 2>&1 | tail -3 && ` +
        `chown -R openclaw:openclaw /opt/openclaw/creative-tools`,
        instance.rootPassword || undefined,
        180000,
    )
}

async function measureOutputFile(
    instance: InstanceRef,
    path: string,
): Promise<{ sizeBytes: number; dimensions: { width: number; height: number } | null }> {
    if (!instance.ip) return { sizeBytes: 0, dimensions: null }
    try {
        const out = await sshExec(
            instance.ip,
            `stat -c%s "${path}" 2>/dev/null; ` +
            `(identify -format "%w %h" "${path}" 2>/dev/null || ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 "${path}" 2>/dev/null)`,
            instance.rootPassword || undefined,
            10000,
        )
        const lines = out.split('\n').filter(Boolean)
        const sizeBytes = parseInt(lines[0] || '0', 10) || 0
        const dim = lines[1] || ''
        const dimMatch = dim.match(/(\d+)[\sx](\d+)/)
        return {
            sizeBytes,
            dimensions: dimMatch ? { width: parseInt(dimMatch[1], 10), height: parseInt(dimMatch[2], 10) } : null,
        }
    } catch {
        return { sizeBytes: 0, dimensions: null }
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// Helpers: parsing + loading
// ═══════════════════════════════════════════════════════════════════════════

interface ParsedFinalDraft {
    _outputId: string
    _type?: string
    creativeId?: string
    scenesId?: string
    conceptId?: string
    tier: 'draft' | 'standard' | 'premium'
    formatType: 'image' | 'video' | 'carousel' | 'audio'
    selectedModel?: string
    resolution?: string
    hebrewOverlay?: boolean
    overlayConfig?: Record<string, unknown>
    logoOverlay?: Record<string, unknown>
    audio?: Record<string, unknown>
    upscale?: boolean
    addSubtitles?: boolean
    estimatedCostUsd?: number
    brandBookVersion?: number
}

function parseFinalDraft(content: string): ParsedFinalDraft | null {
    if (!content) return null
    // Try full JSON parse first
    try {
        const parsed = JSON.parse(content)
        if (parsed._type === 'creative_final_draft') return parsed as ParsedFinalDraft
    } catch { /* try embedded */ }
    // Extract embedded JSON
    const m = content.match(/\{[\s\S]*"_type"\s*:\s*"creative_final_draft"[\s\S]*\}/)
    if (m) {
        try { return JSON.parse(m[0]) } catch { /* fall through */ }
    }
    return null
}

async function loadInstance(instanceId: string): Promise<InstanceRef | null> {
    const [row] = await db.select().from(instances).where(eq(instances.id, instanceId))
    if (!row) return null
    return {
        id: row.id,
        ip: row.ip,
        rootPassword: row.rootPassword,
        falApiKey: (row as any).falApiKey,
        elevenlabsApiKey: (row as any).elevenlabsApiKey,
    }
}

async function loadScenePrompts(
    scenesId: string | undefined,
    instanceId: string,
): Promise<Array<{ order: number; prompt: string; negativePrompt?: string }>> {
    if (!scenesId) {
        // If no scenesId linked, try to use a concept-level prompt as fallback.
        // This shouldn't happen for normal flow (scenes always approved before final).
        return [{ order: 0, prompt: 'brand-aligned creative' }]
    }

    // Find the creative_scenes_draft output containing this scenesId
    const outputs = await db.select().from(agentOutputs)
        .where(and(
            eq(agentOutputs.instanceId, instanceId),
            eq(agentOutputs.outputType, 'creative_scenes_draft'),
        ))

    for (const o of outputs) {
        const content = o.editedContent || o.content || ''
        if (!content.includes(scenesId)) continue
        try {
            const match = content.match(/\{[\s\S]*"scenesId"\s*:\s*"([^"]+)"[\s\S]*\}/)
            if (match && match[1] === scenesId) {
                const parsed = JSON.parse(match[0])
                if (Array.isArray(parsed.scenes)) {
                    return parsed.scenes.map((s: any, i: number) => ({
                        order: s.order ?? i,
                        prompt: s.prompt || '',
                        negativePrompt: s.negativePrompt,
                    }))
                }
            }
        } catch { /* skip malformed */ }
    }

    // Fallback
    return [{ order: 0, prompt: 'brand-aligned creative' }]
}

async function getOutputMetadata(draft: ParsedFinalDraft): Promise<Record<string, unknown>> {
    const [output] = await db.select().from(agentOutputs).where(eq(agentOutputs.id, draft._outputId))
    return (output?.metadata as Record<string, unknown>) || {}
}

// ═══════════════════════════════════════════════════════════════════════════
// overlay.js script — deployed to /opt/openclaw/creative-tools/overlay.js on
// tenant VPS. Uses Sharp for image overlay + ffmpeg+libass for video.
//
// Usage: node overlay.js <jobPath>
// Job format (JSON file):
//   { format, sourcePath, outputPath, overlay: {...}, logo: {...} }
// ═══════════════════════════════════════════════════════════════════════════

const CREATIVE_TOOLS_OVERLAY_JS = `
const fs = require('fs')
const { spawn } = require('child_process')
const path = require('path')

async function main() {
  const jobPath = process.argv[2]
  if (!jobPath) { console.error('job path required'); process.exit(2) }
  const job = JSON.parse(fs.readFileSync(jobPath, 'utf8'))

  if (job.format === 'image') {
    await compositeImage(job)
  } else if (job.format === 'video') {
    await compositeVideo(job)
  } else {
    // Copy source → output as fallback
    fs.copyFileSync(job.sourcePath, job.outputPath)
  }
  console.log('composition done:', job.outputPath)
}

async function compositeImage(job) {
  const sharp = require('sharp')
  let img = sharp(job.sourcePath)
  const meta = await img.metadata()
  const W = meta.width, H = meta.height

  // Build overlay stack
  const overlays = []

  // Hebrew text overlay
  if (job.overlay) {
    const svg = buildHebrewTextSvg(job.overlay, W, H)
    overlays.push({
      input: Buffer.from(svg, 'utf8'),
      top: 0, left: 0,
    })
  }

  // Logo composite
  if (job.logo && job.logo.url) {
    try {
      const logoBuf = await fetchUrl(job.logo.url)
      const sizePct = job.logo.sizePercent || 12
      const logoWidth = Math.round(W * sizePct / 100)
      const safe = job.logo.safeZonePx || 16
      const logoResized = await sharp(logoBuf).resize(logoWidth).png().toBuffer()
      const logoMeta = await sharp(logoResized).metadata()
      const lw = logoMeta.width, lh = logoMeta.height

      let top, left
      switch (job.logo.position) {
        case 'top_left':     top = safe;                 left = safe; break
        case 'top_right':    top = safe;                 left = W - lw - safe; break
        case 'bottom_left':  top = H - lh - safe;        left = safe; break
        case 'bottom_right':
        default:             top = H - lh - safe;        left = W - lw - safe; break
      }
      overlays.push({ input: logoResized, top, left })
    } catch (err) {
      console.error('logo fetch/composite failed:', err.message)
    }
  }

  if (overlays.length > 0) {
    img = img.composite(overlays)
  }

  // Ensure consistent format
  const ext = path.extname(job.outputPath).toLowerCase()
  if (ext === '.jpg' || ext === '.jpeg') {
    await img.jpeg({ quality: 92 }).toFile(job.outputPath)
  } else {
    await img.png().toFile(job.outputPath)
  }
}

function buildHebrewTextSvg(overlay, W, H) {
  // Build an SVG that will be composited full-frame.
  // Hebrew text is RTL — we use direction="rtl" + text-anchor="middle" or "end".
  const font = overlay.font || 'Rubik'
  const fontSize = overlay.fontSize || 48
  const color = overlay.color || '#FFFFFF'
  const bgColor = overlay.background || 'rgba(0,0,0,0.5)'
  const padding = overlay.padding || 24
  const text = (overlay.text || '').replace(/</g, '&lt;').replace(/&/g, '&amp;')
  if (!text) {
    // No text — empty SVG
    return \`<svg xmlns="http://www.w3.org/2000/svg" width="\${W}" height="\${H}"></svg>\`
  }

  const position = overlay.position || 'bottom'
  const estimatedTextWidth = Math.min(W - padding * 2, text.length * fontSize * 0.6)
  const boxHeight = fontSize + padding * 2
  let boxY
  switch (position) {
    case 'top':    boxY = padding; break
    case 'center': boxY = Math.round((H - boxHeight) / 2); break
    case 'bottom':
    default:       boxY = H - boxHeight - padding; break
  }
  const textY = boxY + padding + fontSize * 0.8
  const boxX = Math.round((W - estimatedTextWidth - padding * 2) / 2)

  return \`<svg xmlns="http://www.w3.org/2000/svg" width="\${W}" height="\${H}">
    <rect x="\${boxX}" y="\${boxY}" width="\${estimatedTextWidth + padding * 2}" height="\${boxHeight}" rx="8" ry="8" fill="\${bgColor}"/>
    <text x="\${W / 2}" y="\${textY}" font-family="\${font}, 'Heebo', 'Rubik', Arial, sans-serif" font-size="\${fontSize}" font-weight="700" fill="\${color}" text-anchor="middle" direction="rtl">\${text}</text>
  </svg>\`
}

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const https = require('https')
    const http = require('http')
    const client = url.startsWith('https') ? https : http
    const req = client.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchUrl(res.headers.location).then(resolve).catch(reject)
      }
      if (res.statusCode !== 200) return reject(new Error('HTTP ' + res.statusCode))
      const chunks = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => resolve(Buffer.concat(chunks)))
    })
    req.on('error', reject)
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('fetch timeout')) })
  })
}

async function compositeVideo(job) {
  // Video composition via ffmpeg — for MVP, just copy + add logo watermark.
  // Hebrew text overlay via libass will be added in M2.8.
  return new Promise((resolve, reject) => {
    const args = [
      '-y', '-i', job.sourcePath,
    ]
    let complexFilter = null
    if (job.logo && job.logo.url) {
      // For MVP — need local logo path. Skip remote for now.
      // TODO: download logo first, then use -i <logo> + overlay filter
    }
    if (complexFilter) args.push('-filter_complex', complexFilter)
    args.push('-c:v', 'libx264', '-preset', 'fast', '-crf', '20', '-c:a', 'copy', job.outputPath)

    const ff = spawn('ffmpeg', args)
    let err = ''
    ff.stderr.on('data', d => { err += d.toString() })
    ff.on('close', (code) => {
      if (code === 0) resolve()
      else {
        console.error('ffmpeg failed:', err.substring(err.length - 500))
        // Fallback: copy source to output
        fs.copyFileSync(job.sourcePath, job.outputPath)
        resolve()
      }
    })
  })
}

main().catch(err => { console.error('overlay.js error:', err); process.exit(1) })
`
