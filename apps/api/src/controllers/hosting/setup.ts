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
        DEVICE_ID=$(node -e "try{const d=require(process.env.HOME+\\\"/.openclaw/identity/device.json\\\");console.log(d.deviceId)}catch(e){}" 2>/dev/null)
        PUB_KEY=$(node -e "try{const p=require(process.env.HOME+\\\"/.openclaw/devices/pending.json\\\");const k=Object.values(p)[0];if(k)console.log(k.publicKey)}catch(e){}" 2>/dev/null)

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

        // Ensure CLI device is paired before running channel commands
        await ensureDevicePaired(instance.ip, instance.rootPassword || undefined)

        // Configure Telegram on VPS via OpenClaw CLI
        const sanitizedToken = botToken.replace(/[^a-zA-Z0-9:_-]/g, '')
        const result = await sshExec(instance.ip, `
            su - openclaw -c 'openclaw channels add --channel telegram --token "${sanitizedToken}" --name "telegram-main" 2>&1'
        `, instance.rootPassword || undefined)
        console.log('Telegram add result:', result)

        // Set DM policy to open (no pairing required for users) + allowFrom all
        await sshExec(instance.ip, `
            cd /home/openclaw/.openclaw &&
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

        // Restart gateway to pick up channel config
        await sshExec(instance.ip, 'systemctl restart openclaw-gateway', instance.rootPassword || undefined)

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
