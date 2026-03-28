import type { Context } from 'hono'
import { readFileSync } from 'fs'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { instances } from '@/db/schema'
import { ok, fail } from '@/lib/response'
import { Client } from 'ssh2'

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

// POST /hosting/instances/:id/setup/api-key
export const setupApiKey = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        const { provider, apiKey } = await c.req.json<{ provider: string; apiKey: string }>()

        if (!provider || !apiKey) {
            return fail(c, 'Provider and API key are required.', 400)
        }

        const [instance] = await db.select().from(instances).where(eq(instances.id, instanceId))
        if (!instance?.ip) {
            return fail(c, 'Instance not found or not ready.', 404)
        }

        // Set API key as environment variable in OpenClaw systemd service
        const envVar = provider === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY'

        await sshExec(instance.ip, `
            grep -q ${envVar} /etc/systemd/system/openclaw-gateway.service && \
                sed -i "s|Environment=${envVar}=.*|Environment=${envVar}=${apiKey}|" /etc/systemd/system/openclaw-gateway.service || \
                sed -i "/Environment=NODE_ENV=production/a\\Environment=${envVar}=${apiKey}" /etc/systemd/system/openclaw-gateway.service && \
            systemctl daemon-reload && \
            systemctl restart openclaw-gateway
        `, instance.rootPassword || undefined)

        // Update onboarding step
        const step = instance.onboardingStep || 0
        if (step < 2) {
            await db.update(instances)
                .set({ onboardingStep: 2 })
                .where(eq(instances.id, instanceId))
        }

        return ok(c, { provider }, 'API key configured.')
    } catch (err) {
        console.error('setupApiKey error:', err)
        return fail(c, 'Failed to configure API key.', 500)
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

        const [instance] = await db.select().from(instances).where(eq(instances.id, instanceId))
        if (!instance?.ip) {
            return fail(c, 'Instance not found or not ready.', 404)
        }

        // Configure Telegram on VPS
        const sanitizedToken = botToken.replace(/[^a-zA-Z0-9:_-]/g, '')
        await sshExec(instance.ip, `
            su - openclaw -c 'openclaw channels add --channel telegram --bot-token "${sanitizedToken}" --name "telegram-main" 2>&1' ||
            echo '{"channel":"telegram","token":"${sanitizedToken}"}' > /home/openclaw/.openclaw/channels/telegram.json &&
            chown -R openclaw:openclaw /home/openclaw/.openclaw
        `, instance.rootPassword || undefined)

        // Save telegram token in our DB
        // For MATEH users, onboarding continues with research wizard
        const components = (instance.selectedComponents as string[]) || []
        const hasMATEH = components.includes('mt')
        await db.update(instances)
            .set({
                telegramBotToken: botToken,
                onboardingStep: 3,
                onboardingCompleted: !hasMATEH
            })
            .where(eq(instances.id, instanceId))

        return ok(c, null, 'Telegram connected.')
    } catch (err) {
        console.error('setupTelegram error:', err)
        return fail(c, 'Failed to connect Telegram.', 500)
    }
}

// POST /hosting/instances/:id/setup/complete
export const completeOnboarding = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')

        await db.update(instances)
            .set({ onboardingCompleted: true })
            .where(eq(instances.id, instanceId))

        return ok(c, null, 'Onboarding completed.')
    } catch (err) {
        console.error('completeOnboarding error:', err)
        return fail(c, 'Failed to complete onboarding.', 500)
    }
}
