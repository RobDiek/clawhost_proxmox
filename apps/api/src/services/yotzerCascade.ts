/**
 * Yotzer Cascade (after approve)
 *
 * When user approves a creative_* Gate output, auto-invoke yotzer to produce
 * the next gate's draft. This removes manual SSH/CLI step between gates.
 *
 * Cascade chain:
 *   creative_concept_draft      approved → draft_character_reference (Gate 2)
 *   creative_character_draft    approved → draft_scene_variations    (Gate 3)
 *   creative_scenes_draft       approved → draft_final_creative      (Gate 4)
 *   creative_final_draft        approved → executeCreativeRender     (already wired in outputs.ts)
 *
 * Invoked from outputs.ts `triggerPostApprove` for creative_ prefix types.
 *
 * For character draft user chooses a variant (v1..v4). We encode the choice
 * in `editedContent.selectedVariation` OR fall back to variant metadata.
 */

import { randomBytes } from 'crypto'
import { readFileSync } from 'fs'
import { Client } from 'ssh2'
import { eq } from 'drizzle-orm'

import { db } from '@/db'
import type { agentOutputs } from '@/db/schema';
import { instances } from '@/db/schema'

const SSH_KEY_PATH = process.env.MASTER_SSH_KEY_PATH || '/root/.ssh/openclaw_master'
let sshKeyCache: Buffer | null = null
function getSSHKey(): Buffer {
    if (!sshKeyCache) sshKeyCache = readFileSync(SSH_KEY_PATH)
    return sshKeyCache
}

function sshExecDetached(ip: string, command: string, password?: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const conn = new Client()
        const timer = setTimeout(() => { conn.end(); reject(new Error('SSH start timeout')) }, 15000)
        conn.on('ready', () => {
            conn.exec(`nohup bash -c '${command.replace(/'/g, "'\\''")}' > /tmp/_yotzer_cascade.log 2>&1 & echo SPAWNED`, (err, stream) => {
                if (err) { clearTimeout(timer); conn.end(); return reject(err) }
                stream.on('data', () => { /* ignore */ })
                stream.on('close', () => { clearTimeout(timer); conn.end(); resolve() })
            })
        }).on('error', err => { clearTimeout(timer); reject(err) })
        const opts: Record<string, unknown> = { host: ip, port: 22, username: 'root', readyTimeout: 10000 }
        if (password) opts.password = password
        try { opts.privateKey = getSSHKey() } catch { if (!password) return reject(new Error('No SSH key or password')) }
        conn.connect(opts)
    })
}

// ═══════════════════════════════════════════════════════════════════════════
// Main entry
// ═══════════════════════════════════════════════════════════════════════════

export async function cascadeCreativeGate(output: typeof agentOutputs.$inferSelect): Promise<void> {
    const type = output.outputType
    if (!type?.startsWith('creative_') || !type.endsWith('_draft')) return
    // Final draft is handled elsewhere (render executor)
    if (type === 'creative_final_draft') return

    const [inst] = await db.select().from(instances).where(eq(instances.id, output.instanceId))
    if (!inst?.ip) {
        console.warn(`[yotzerCascade] ${output.id} — instance has no IP, skipping`)
        return
    }

    const content = output.editedContent || output.content || ''
    const draft = parseDraft(content, type)
    if (!draft) {
        console.warn(`[yotzerCascade] ${output.id} — could not parse ${type} JSON, skipping`)
        return
    }

    let prompt: string | null = null

    if (type === 'creative_concept_draft') {
        prompt = buildGate2Prompt(draft)
    } else if (type === 'creative_character_draft') {
        prompt = buildGate3Prompt(draft, output)
    } else if (type === 'creative_scenes_draft') {
        prompt = buildGate4Prompt(draft)
    }

    if (!prompt) return

    const sessionId = `cascade-${type.substring(9, 19)}-${Date.now()}-${randomBytes(3).toString('hex')}`
    const b64Prompt = Buffer.from(prompt).toString('base64')
    const sshCommand = `su - openclaw -c 'timeout 240 openclaw agent --agent yotzer --session-id ${sessionId} -m "$(echo ${b64Prompt} | base64 -d)" --json >> /tmp/yotzer-${sessionId}.log 2>&1'`

    try {
        await sshExecDetached(inst.ip, sshCommand, inst.rootPassword || undefined)
        console.log(`[yotzerCascade] triggered ${nextGateName(type)} for ${output.id} (session ${sessionId})`)
    } catch (err) {
        console.error(`[yotzerCascade] SSH failed for ${output.id}:`, err)
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// Prompt builders per gate
// ═══════════════════════════════════════════════════════════════════════════

function buildGate2Prompt(conceptDraft: any): string {
    const conceptId = conceptDraft.conceptId
    return [
        'אתה יוצר (yotzer). הקונספט (Gate 1) אושר ע"י המשתמש.',
        '',
        '**קונספט שאושר:**',
        `- conceptId: ${conceptId}`,
        `- brief: ${conceptDraft.brief || ''}`,
        `- goal: ${conceptDraft.goal}`,
        `- platform: ${conceptDraft.platform}`,
        `- formatType: ${conceptDraft.formatType}`,
        `- tier: ${conceptDraft.tier}`,
        conceptDraft.hook ? `- hook: ${conceptDraft.hook}` : '',
        conceptDraft.visualDirection ? `- visualDirection: ${conceptDraft.visualDirection}` : '',
        '',
        '**משימה:** הפעל draft_character_reference(...) עם conceptId הנוכחי.',
        'תכן subjectType + subjectDescription מתוך ה-brief, השתמש ב-brand_book (כבר קרוא אוטומטית) לצבעים/סגנון.',
        '',
        '**הפלאגין יחזיר 4 וריאציות** (hero-shot / lifestyle / dramatic / minimalist). עצור שם — המשתמש יבחר variant.',
        'כתוב את ה-draft בפלט, הסבר קצר מה כל variant מציג, ובקש מהמשתמש לאשר.',
    ].filter(Boolean).join('\n')
}

function buildGate3Prompt(characterDraft: any, output: typeof agentOutputs.$inferSelect): string {
    // Try to figure out which variant user picked.
    // User can indicate via editedContent hint: "selectedVariation: v2" or similar.
    const editedContent = output.editedContent || ''
    const selectedMatch = editedContent.match(/selectedVariation\s*[:-]\s*(v\d)/i)
    const selected = selectedMatch?.[1] || 'v1'   // default to hero-shot if unspecified

    return [
        'אתה יוצר (yotzer). דמות המותג (Gate 2) אושרה.',
        '',
        '**דמות שאושרה:**',
        `- characterRefId: ${characterDraft.characterRefId}`,
        `- conceptId: ${characterDraft.conceptId}`,
        `- subjectType: ${characterDraft.subjectType}`,
        `- subjectDescription: ${characterDraft.subjectDescription}`,
        `- styleDirection: ${characterDraft.styleDirection}`,
        `- selectedVariation: ${selected} (${characterDraft.variations?.find((v: any) => v.id === selected)?.variant || 'default'})`,
        '',
        '**משימה:** הפעל draft_scene_variations עם characterRefId + conceptId + selectedVariation.',
        'בנה sceneCount מתאים לפורמט (image=1, video=3-5). לכל scene מלא action/camera/prompt/voiceoverHe/onScreenTextHe.',
        '',
        'עצור אחרי ה-draft — המשתמש יאשר סטורי-בורד.',
    ].filter(Boolean).join('\n')
}

function buildGate4Prompt(scenesDraft: any): string {
    const tier = scenesDraft.tier || 'standard'
    return [
        'אתה יוצר (yotzer). סצנות (Gate 3) אושרו.',
        '',
        '**סצנות שאושרו:**',
        `- scenesId: ${scenesDraft.scenesId}`,
        `- conceptId: ${scenesDraft.conceptId}`,
        `- characterRefId: ${scenesDraft.characterRefId}`,
        `- sceneCount: ${scenesDraft.sceneCount}`,
        '',
        '**משימה:** הפעל draft_final_creative עם scenesId + conceptId + tier.',
        'קבע formatType לפי הקונספט. הפלאגין יזריק אוטומטית:',
        '- overlayConfig (font/color מ-brand book)',
        '- logoOverlay (אם יש לוגו)',
        '- model selection לפי tier',
        '- audio + subtitles אם video',
        '',
        'כתוב את draft הסופי. אחרי אישור המשתמש — הרנדור יתחיל אוטומטית דרך fal.ai.',
    ].filter(Boolean).join('\n')
}

// ═══════════════════════════════════════════════════════════════════════════
// Parse draft JSON from approved output content
// ═══════════════════════════════════════════════════════════════════════════

function parseDraft(content: string, type: string): any | null {
    if (!content) return null
    try {
        const parsed = JSON.parse(content)
        if (parsed._type === type) return parsed
    } catch { /* try embedded */ }
    const re = new RegExp(`\\{[\\s\\S]*"_type"\\s*:\\s*"${type}"[\\s\\S]*\\}`)
    const m = content.match(re)
    if (m) {
        try { return JSON.parse(m[0]) } catch { /* noop */ }
    }
    return null
}

function nextGateName(currentType: string): string {
    return ({
        creative_concept_draft: 'Gate 2 (character)',
        creative_character_draft: 'Gate 3 (scenes)',
        creative_scenes_draft: 'Gate 4 (final)',
    })[currentType] || 'unknown'
}