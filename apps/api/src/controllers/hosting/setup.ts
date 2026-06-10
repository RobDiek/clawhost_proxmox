import type { Context } from 'hono'
import { readFileSync } from 'fs'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { instances } from '@/db/schema'
import { ok, fail } from '@/lib/response'
import { Client } from 'ssh2'
import { resolveUserId, getOwnedInstance } from './authHelper'
import { setAgentIntegration, getPrimaryAgent } from '@/services/agentIntegrations'
import { resolveActiveAgent } from '@/services/agentContext'
import { matehAgents } from '@/db/schema'

const SSH_KEY_PATH = process.env.MASTER_SSH_KEY_PATH || '/root/.ssh/openclaw_master'

let sshKeyCache: Buffer | null = null
function getSSHKey(): Buffer {
    if (!sshKeyCache) {
        sshKeyCache = readFileSync(SSH_KEY_PATH)
    }
    return sshKeyCache
}

function sshExec(ip: string, command: string, password?: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const conn = new Client()
        let output = ''

        conn.on('ready', () => {
            conn.exec(command, (err, stream) => {
                if (err) { conn.end(); return reject(err) }
                stream.on('data', (data: Buffer) => { output += data.toString() })
                stream.stderr.on('data', (data: Buffer) => { output += data.toString() })
                stream.on('close', () => { conn.end(); resolve(output.trim()) })
            })
        })
        .on('error', reject)

        const connectOpts: Record<string, unknown> = {
            host: ip,
            port: 22,
            username: 'root',
        }

        // Try SSH key first, fall back to password
        if (password) {
            connectOpts.password = password
        }

        try {
            connectOpts.privateKey = getSSHKey()
        } catch {
            // SSH key not available, password required
            if (!password) return reject(new Error('No SSH key or password available'))
        }

        conn.connect(connectOpts)
    })
}

// ── Ensure CLI device is paired with gateway ──
async function ensureDevicePaired(ip: string, password?: string): Promise<void> {
    // Check if device is already paired by testing a CLI command
    const test = await sshExec(ip, `su - openclaw -c 'openclaw cron list 2>&1' 2>&1`, password)
    if (!test.includes('pairing required') && !test.includes('abnormal closure')) {
        return // Already paired
    }

    console.log(`Device not paired on ${ip}, pairing now...`)

    // Set gateway port and trigger device identity creation
    await sshExec(ip, `su - openclaw -c 'openclaw config set gateway.port 3000 2>/dev/null' 2>&1`, password)
    await sshExec(ip, `su - openclaw -c 'openclaw cron list 2>/dev/null || true' 2>&1`, password)
    await new Promise(r => setTimeout(r, 2000))

    // Read pending request and approve it
    await sshExec(ip, `
        su - openclaw -c '
        DEVICE_ID=$(node -e "try{const d=require(process.env.HOME+\\"/.openclaw/identity/device.json\\");console.log(d.deviceId)}catch(e){}" 2>/dev/null)
        PUB_KEY=$(node -e "try{const p=require(process.env.HOME+\\"/.openclaw/devices/pending.json\\");const k=Object.values(p)[0];if(k)console.log(k.publicKey)}catch(e){}" 2>/dev/null)

        if [ -n "$DEVICE_ID" ] && [ -n "$PUB_KEY" ]; then
            mkdir -p ~/.openclaw/devices
            cat > ~/.openclaw/devices/paired.json << EOFPAIR
{
  "$DEVICE_ID": {
    "deviceId": "$DEVICE_ID",
    "publicKey": "$PUB_KEY",
    "platform": "linux",
    "clientId": "cli",
    "clientMode": "cli",
    "role": "operator",
    "roles": ["operator"],
    "scopes": ["operator.admin","operator.read","operator.write","operator.approvals","operator.pairing"],
    "pairedAtMs": '$(date +%s000)',
    "label": "local-cli"
  }
}
EOFPAIR
            echo "{}" > ~/.openclaw/devices/pending.json
        fi
        '
    `, password)

    // Restart gateway to pick up pairing
    await sshExec(ip, 'systemctl restart openclaw-gateway', password)
    await new Promise(r => setTimeout(r, 4000))
}

// POST /hosting/instances/:id/setup/api-key
export const setupApiKey = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        const { provider, apiKey } = await c.req.json<{ provider: string; apiKey: string }>()

        if (!provider || !apiKey) {
            return fail(c, 'Provider and API key are required.', 400)
        }

        const userId = resolveUserId(c)
        const instance = await getOwnedInstance(instanceId, userId)
        if (!instance?.ip) {
            return fail(c, 'Instance not found or not ready.', 404)
        }

        // Validate API key format (alphanumeric + dashes only)
        if (!/^[a-zA-Z0-9_-]+$/.test(apiKey)) {
            return fail(c, 'Invalid API key format.', 400)
        }

        // Phase 2.3.E — resolve active mateh_agent for per-agent SSH paths
        const __activeAgent = await resolveActiveAgent(c, instanceId)
        const isSecondary = !!(__activeAgent && !__activeAgent.isPrimary)
        const __ocHome = isSecondary
            ? `/home/openclaw/agents/${__activeAgent!.id}/.openclaw`
            : '/home/openclaw/.openclaw'
        const __short = isSecondary ? __activeAgent!.id.slice(4) : ''
        const __systemdUnit = isSecondary
            ? `openclaw-gateway-${__short}`
            : 'openclaw-gateway'

        // Set API key in THREE places so both the systemd gateway AND CLI
        // invocations can read it. For secondary agents, all three paths
        // are scoped to the agent's directory + own systemd unit.
        const envVar = provider === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY'
        const SVC = `/etc/systemd/system/${__systemdUnit}.service`
        const keyB64 = Buffer.from(apiKey).toString('base64')
        await sshExec(instance.ip, `
            KEY=$(echo '${keyB64}' | base64 -d) && \
            (grep -q ${envVar} ${SVC} && \
                sed -i "s|Environment=${envVar}=.*|Environment=${envVar}=$KEY|" ${SVC} || \
                sed -i "/Environment=NODE_ENV=production/a\\Environment=${envVar}=$KEY" ${SVC}) && \
            mkdir -p ${__ocHome} && \
            (grep -q "^${envVar}=" ${__ocHome}/.env 2>/dev/null && \
                sed -i "s|^${envVar}=.*|${envVar}=$KEY|" ${__ocHome}/.env || \
                echo "${envVar}=$KEY" >> ${__ocHome}/.env) && \
            chown openclaw:openclaw ${__ocHome}/.env && \
            systemctl daemon-reload && \
            systemctl restart ${__systemdUnit}
        `, instance.rootPassword || undefined)

        // Save key in DB — for active mateh_agent. Phase 2.3.E: writes to
        // mateh_agents row first; primary mirrors to instances.* for legacy.
        const updateData: Record<string, unknown> = {}
        if (provider === 'anthropic') {
            updateData.aiProviderKey = apiKey
            updateData.aiProviderType = 'anthropic'
        } else if (provider === 'openai') {
            updateData.openaiApiKey = apiKey
            // When OpenAI key is added, set default model on the right
            // openclaw.json (per-agent).
            await sshExec(instance.ip, `
                cd ${__ocHome} &&
                node -e "
                  const fs = require('fs');
                  const cfg = JSON.parse(fs.readFileSync('openclaw.json','utf-8'));
                  if (!cfg.agents) cfg.agents = {};
                  if (!cfg.agents.defaults) cfg.agents.defaults = {};
                  cfg.agents.defaults.model = 'openai/gpt-4o';
                  fs.writeFileSync('openclaw.json', JSON.stringify(cfg, null, 2));
                " &&
                chown openclaw:openclaw openclaw.json &&
                systemctl restart ${__systemdUnit}
            `, instance.rootPassword || undefined)
        }
        const step = (__activeAgent?.onboardingStep ?? instance.onboardingStep) || 0
        if (step < 2) updateData.onboardingStep = 2

        if (__activeAgent) {
            await db.update(matehAgents)
                .set({ ...updateData, updatedAt: new Date() })
                .where(eq(matehAgents.id, __activeAgent.id))
            if (__activeAgent.isPrimary) {
                await db.update(instances).set(updateData).where(eq(instances.id, instanceId))
            }
        } else {
            await db.update(instances).set(updateData).where(eq(instances.id, instanceId))
        }

        return ok(c, { provider }, 'API key configured.')
    } catch (err) {
        console.error('setupApiKey error:', err)
        return fail(c, 'Failed to configure API key.', 500)
    }
}

// POST /hosting/instances/:id/google-ads-mode
// Body: { mode: 'self' | 'haas' }
// Records the customer's choice between self-managed Google Ads (their own
// Manager Account + Developer Token) and HaaS managed-service tier
// (Flowmatic MCC link + our PPC team operates on their behalf).
//
// Why both paths exist:
//  - SELF: clean SaaS / "tool" model. Customer owns Developer Token. We never
//    link their account to our MCC. Maximum independence, no agency
//    obligations on our side.
//  - HAAS: paid managed tier. Customer subscribes to a HaaS plan, signs DPA at
//    checkout, then accepts an MCC invitation. We operate via our own
//    Developer Token + per-account permissions for the assigned PPC analyst.
export const setGoogleAdsMode = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        const userId = resolveUserId(c)
        const instance = await getOwnedInstance(instanceId, userId)
        if (!instance) return fail(c, 'Instance not found', 404)

        const raw = await c.req.json<{ mode?: string }>()
        const body = raw as { mode?: string }
        const mode = body.mode
        if (mode !== 'self' && mode !== 'haas') {
            return fail(c, 'mode must be "self" or "haas"', 400)
        }

        // Phase 4.3-P — per-agent. Mode is now stored on mateh_agents row.
        const { resolveActiveAgent, writeGoogleAdsConfig } = await import('@/services/agentContext')
        const __agent = await resolveActiveAgent(c, instanceId)
        await writeGoogleAdsConfig(__agent, instanceId, { mode })

        return ok(c, { mode }, 'Google Ads mode saved')
    } catch (err) {
        console.error('setGoogleAdsMode error:', err)
        return fail(c, 'Failed to save Google Ads mode.', 500)
    }
}

// POST /hosting/instances/:id/google-ads-haas/request-invite
// Body: { customerId: string (10 digits) }
// Customer (HaaS-tier) submits their Customer ID; backend records the request
// + alerts Flowmatic ops via Telegram so the team can send the actual Google
// Ads MCC invitation manually. v2 will wire this to the Google Ads MCC API
// (CustomerClientLinkService) for fully-automated invitation sending.
export const requestHaasMccInvite = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        const userId = resolveUserId(c)
        const instance = await getOwnedInstance(instanceId, userId)
        if (!instance) return fail(c, 'Instance not found', 404)

        const raw = await c.req.json<{ customerId?: string }>()
        const body = raw as { customerId?: string }
        const customerId = (body.customerId || '').replace(/\D/g, '')
        if (!/^\d{10}$/.test(customerId)) {
            return fail(c, 'customerId must be 10 digits', 400)
        }

        // Phase 4.3-P — per-active-agent. HaaS invite is requested for a
        // SPECIFIC agent (which has its own customerId pending). Don't
        // overwrite the primary's record when a secondary requests.
        const { readGoogleAdsConfigForActive, writeGoogleAdsConfig } = await import('@/services/agentContext')
        const { config: existing, agent: __agent } = await readGoogleAdsConfigForActive(c, instanceId)
        await writeGoogleAdsConfig(__agent, instanceId, {
            mode: 'haas',
            config: {
                ...(existing || {}),
                customerId,
                haasInviteRequestedAt: new Date().toISOString(),
                haasInviteStatus: 'pending',
            },
        })

        // Alert ops on Telegram. Failure is non-blocking — request is already
        // persisted, ops can pick up via dashboard/admin view.
        try {
            const telegram = (await import('@/services/telegram')).default
            await telegram.alertAdmin(
                `🤝 *HaaS MCC invite request*\n` +
                `Instance: \`${instanceId}\`\n` +
                `Customer ID: \`${customerId}\`\n` +
                `Tenant subdomain: ${instance.subdomainAgent || '(unknown)'}\n\n` +
                `Action: send Google Ads invitation from Flowmatic MCC to this Customer ID.`
            )
        } catch { /* non-blocking */ }

        return ok(c, { customerId, status: 'pending' }, 'Invitation request submitted')
    } catch (err) {
        console.error('requestHaasMccInvite error:', err)
        return fail(c, 'Failed to submit invitation request.', 500)
    }
}

// POST /hosting/instances/:id/setup/telegram
export const setupTelegram = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        const { botToken } = await c.req.json<{ botToken: string }>()

        if (!botToken) {
            return fail(c, 'Bot token is required.', 400)
        }

        const userId = resolveUserId(c)
        const instance = await getOwnedInstance(instanceId, userId)
        if (!instance?.ip) {
            return fail(c, 'Instance not found or not ready.', 404)
        }

        // Phase 2.3.E — resolve active mateh_agent so all writes go to the
        // right per-agent paths (DB row, openclaw home dir, systemd unit).
        const __activeAgent = await resolveActiveAgent(c, instanceId)
        const isSecondary = !!(__activeAgent && !__activeAgent.isPrimary)
        const __ocHome = isSecondary
            ? `/home/openclaw/agents/${__activeAgent!.id}/.openclaw`
            : '/home/openclaw/.openclaw'
        // openclaw resolves config as $HOME/.openclaw. CLI MUST set HOME=baseHome
        // (NOT OPENCLAW_HOME=ocHome): on openclaw 2026.6.x OPENCLAW_HOME is a base
        // and .openclaw is appended → .openclaw/.openclaw/openclaw.json, which the
        // gateway never reads → "Added account" but status "not configured"
        // (silent no-op). HOME=base matches the gateway unit's Environment=HOME on
        // both 2026.4.x and 2026.6.x.
        const __baseHome = isSecondary
            ? `/home/openclaw/agents/${__activeAgent!.id}`
            : '/home/openclaw'
        const __short = isSecondary ? __activeAgent!.id.slice(4) : ''
        const __systemdUnit = isSecondary
            ? `openclaw-gateway-${__short}`
            : 'openclaw-gateway'

        // Ensure CLI device is paired before running channel commands
        // (primary only — secondaries run their own gateway with own pairing)
        if (!isSecondary) {
            await ensureDevicePaired(instance.ip, instance.rootPassword || undefined)
        }

        // Configure Telegram on VPS via OpenClaw CLI — run with HOME=baseHome so
        // the CLI writes to the SAME $HOME/.openclaw/openclaw.json the (per-agent)
        // gateway reads. See __baseHome note above.
        const sanitizedToken = botToken.replace(/[^a-zA-Z0-9:_-]/g, '')
        const result = await sshExec(instance.ip, `
            su - openclaw -c 'HOME=${__baseHome} openclaw channels add --channel telegram --token "${sanitizedToken}" --name "telegram-main" 2>&1'
        `, instance.rootPassword || undefined)
        console.log('Telegram add result:', result)

        // Set DM policy to open (no pairing required for users) + allowFrom all
        await sshExec(instance.ip, `
            cd ${__ocHome} &&
            node -e "
              const fs = require('fs');
              const cfg = JSON.parse(fs.readFileSync('openclaw.json','utf-8'));
              if (cfg.channels && cfg.channels.telegram) {
                cfg.channels.telegram.dmPolicy = 'open';
                cfg.channels.telegram.allowFrom = ['*'];
              }
              fs.writeFileSync('openclaw.json', JSON.stringify(cfg, null, 2));
            " &&
            chown openclaw:openclaw openclaw.json
        `, instance.rootPassword || undefined)

        // Restart gateway to pick up channel config (per-agent unit)
        await sshExec(instance.ip, `systemctl restart ${__systemdUnit}`, instance.rootPassword || undefined)

        // Auto-detect chat_id: temporarily remove webhook, poll for /start message
        let chatId: string | null = null
        try {
            // Delete webhook so getUpdates works
            await fetch(`https://api.telegram.org/bot${sanitizedToken}/deleteWebhook`)
            await new Promise(r => setTimeout(r, 1000))

            // Poll for recent messages (user should have sent /start)
            const updatesRes = await fetch(`https://api.telegram.org/bot${sanitizedToken}/getUpdates?limit=10&timeout=1`)
            const updatesData = await updatesRes.json() as { ok?: boolean; result?: Array<{ message?: { chat?: { id?: number }; text?: string } }> }

            if (updatesData.ok && updatesData.result) {
                // Find the most recent /start or any message
                for (const update of updatesData.result.reverse()) {
                    if (update.message?.chat?.id) {
                        chatId = String(update.message.chat.id)
                        console.log(`Auto-detected Telegram chat_id: ${chatId}`)
                        break
                    }
                }
            }
        } catch (e) {
            console.error('Chat ID auto-detect failed:', e)
        }

        // Restart gateway will re-register webhook via OpenClaw
        await sshExec(instance.ip, `systemctl restart ${__systemdUnit}`, instance.rootPassword || undefined)
        await new Promise(r => setTimeout(r, 3000))

        // Quality gate — verify the channel is ACTUALLY configured on the VPS
        // before recording it as connected. `channels add` can report "Added"
        // while the gateway still sees "not configured" (home-path drift, etc.),
        // which would render a green card with a dead bot (silent no-op). Probe
        // the gateway; if not configured, fail loudly instead of persisting a
        // false "connected". A probe transport error is non-fatal (don't block on
        // SSH flakiness right after a successful add).
        let __probe: string | null = null
        try {
            __probe = await sshExec(instance.ip,
                `su - openclaw -c 'HOME=${__baseHome} openclaw channels status --probe 2>&1'`,
                instance.rootPassword || undefined)
        } catch (e) {
            console.warn('[setupTelegram] status probe failed (non-fatal):', (e as Error).message)
        }
        if (__probe !== null) {
            const __tgLine = __probe.split('\n').find(l => /telegram/i.test(l)) || ''
            // Hard-fail ONLY on the unambiguous failure signature ("not configured")
            // so a green card never hides a dead bot. Be conservative across openclaw
            // versions: if the probe yields no recognizable telegram line (older
            // status format / command absent), treat as inconclusive and proceed —
            // never false-fail a genuinely-working connect on the pinned client version.
            if (/not configured/i.test(__tgLine)) {
                console.error(`[setupTelegram] channel NOT configured on VPS for ${instanceId}: ${__tgLine || __probe.slice(0, 200)}`)
                return fail(c, 'החיבור לטלגרם לא הושלם בצד השרת. נסו שוב — אם נמשך, פנו לתמיכה.', 500)
            }
            console.log(`[setupTelegram] VPS channel probe: ${__tgLine.trim() || '(inconclusive — proceeding)'}`)
        }

        // Save telegram token + chat_id in our DB. Phase 2.3.E — for the
        // active mateh_agent (primary writes also mirror to instances.* for
        // legacy compat; secondary writes only to mateh_agents row).
        // For MATEH users, onboarding continues with research wizard.
        const components = (instance.selectedComponents as string[]) || []
        const hasMATEH = components.includes('mt')
        const { randomBytes } = await import('crypto')
        const webhookSecret = randomBytes(24).toString('hex')
        if (__activeAgent) {
            await db.update(matehAgents).set({
                telegramBotToken: botToken,
                telegramChatId: chatId,
                telegramWebhookSecret: webhookSecret,
                onboardingStep: 3,
                onboardingCompleted: !hasMATEH,
                updatedAt: new Date(),
            }).where(eq(matehAgents.id, __activeAgent.id))
            if (__activeAgent.isPrimary) {
                await db.update(instances).set({
                    telegramBotToken: botToken,
                    telegramChatId: chatId,
                    telegramWebhookSecret: webhookSecret,
                    onboardingStep: 3,
                    onboardingCompleted: !hasMATEH,
                }).where(eq(instances.id, instanceId))
            }
        } else {
            // Legacy fallback (no mateh_agent row yet)
            await db.update(instances).set({
                telegramBotToken: botToken,
                telegramChatId: chatId,
                telegramWebhookSecret: webhookSecret,
                onboardingStep: 3,
                onboardingCompleted: !hasMATEH,
            }).where(eq(instances.id, instanceId))
        }

        // Register our approval-queue webhook with Telegram. The OpenClaw
        // conversational gateway uses long-polling (deleteWebhook above), so
        // our setWebhook doesn't conflict. If it fails (e.g. test bot without
        // public URL), the user still receives approval messages — only the
        // inline button callbacks won't be handled here.
        try {
            const { registerTelegramWebhook } = await import('@/services/approvalQueueTelegram')
            const webhookRes = await registerTelegramWebhook(botToken, instanceId, webhookSecret)
            console.log(`[setupTelegram] setWebhook for ${instanceId}: ${webhookRes.ok ? 'ok' : webhookRes.error}`)
        } catch (err) {
            console.warn('[setupTelegram] setWebhook registration failed (non-fatal):', (err as Error).message)
        }

        // Write to per-agent integrations table — Phase 2.3.E: pass
        // active mateh_agent's id so the upsert hits the right unique key.
        const agentType = (await c.req.json().catch(() => ({}))).agentType || getPrimaryAgent(components)
        await setAgentIntegration(
            instanceId,
            agentType as any,
            'telegram',
            { botToken, chatId },
            'connected',
            __activeAgent?.id,
        ).catch(err => console.error('Failed to set agent integration:', err))

        return ok(c, { chatId: chatId ? 'detected' : 'pending' }, 'Telegram connected.' + (chatId ? '' : ' שלחו /start לבוט כדי להפעיל פרסום.'))
    } catch (err) {
        console.error('setupTelegram error:', err)
        return fail(c, 'Failed to connect Telegram.', 500)
    }
}

// POST /hosting/instances/:id/setup/complete
export const completeOnboarding = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        const userId = resolveUserId(c)
        const instance = await getOwnedInstance(instanceId, userId)
        if (!instance) return fail(c, 'Instance not found.', 404)

        await db.update(instances)
            .set({ onboardingCompleted: true })
            .where(eq(instances.id, instanceId))

        return ok(c, null, 'Onboarding completed.')
    } catch (err) {
        console.error('completeOnboarding error:', err)
        return fail(c, 'Failed to complete onboarding.', 500)
    }
}