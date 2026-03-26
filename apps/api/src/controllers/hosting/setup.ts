import type { Context } from 'hono'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { instances } from '@/db/schema'
import { ok, fail } from '@/lib/response'
import { Client } from 'ssh2'

const SSH_KEY_PATH = process.env.MASTER_SSH_KEY_PATH || ''

function sshExec(ip: string, command: string): Promise<string> {
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
        .connect({
            host: ip,
            port: 22,
            username: 'root',
            privateKey: require('fs').readFileSync(SSH_KEY_PATH),
        })
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

        // Write API key to OpenClaw config on VPS
        const configCmd = provider === 'anthropic'
            ? `cd /home/openclaw && openclaw provider add anthropic --api-key "${apiKey}" 2>&1 || echo '{"provider":"anthropic","key":"${apiKey}"}' > /home/openclaw/.openclaw/providers/anthropic.json`
            : `cd /home/openclaw && openclaw provider add openai --api-key "${apiKey}" 2>&1 || echo '{"provider":"openai","key":"${apiKey}"}' > /home/openclaw/.openclaw/providers/openai.json`

        await sshExec(instance.ip, `
            mkdir -p /home/openclaw/.openclaw/providers &&
            ${configCmd} &&
            chown -R openclaw:openclaw /home/openclaw/.openclaw
        `)

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
        await sshExec(instance.ip, `
            cd /home/openclaw &&
            openclaw channel add telegram --token "${botToken}" 2>&1 ||
            echo '{"channel":"telegram","token":"${botToken}"}' > /home/openclaw/.openclaw/channels/telegram.json &&
            chown -R openclaw:openclaw /home/openclaw/.openclaw
        `)

        // Save telegram token in our DB
        await db.update(instances)
            .set({
                telegramBotToken: botToken,
                onboardingStep: 3,
                onboardingCompleted: true
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
