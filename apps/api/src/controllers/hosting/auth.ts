import type { Context } from 'hono'
import crypto from 'crypto'
import { eq, and, gt, lt, sql } from 'drizzle-orm'
import { db } from '@/db'
import { otpCodes, users, instances } from '@/db/schema'
import { ok, fail } from '@/lib/response'
import telegram from '@/services/telegram'
import { getAllIntegrations as getAllIntegrationsRaw, getPrimaryAgent } from '@/services/agentIntegrations'

// Helper to format agent integrations grouped by agent type, with display details
async function getAllIntegrationsForInstance(instanceId: string) {
    const raw = await getAllIntegrationsRaw(instanceId)
    const grouped: Record<string, Record<string, { connected: boolean; status: string; config?: Record<string, unknown> }>> = {}
    for (const r of raw) {
        if (!grouped[r.agentType]) grouped[r.agentType] = {}
        grouped[r.agentType][r.integrationType] = {
            connected: r.status === 'connected',
            status: r.status,
            config: r.config,
        }
    }
    return grouped
}

// Helper: derive legacy-shaped integration summary from agent_integrations data
function deriveLegacyIntegrations(
    agentInts: Record<string, Record<string, { connected: boolean; status: string; config?: Record<string, unknown> }>>,
    primaryAgent: string,
    fallback: { telegramBotToken: any; googleTokens: any; microsoftTokens: any; metaTokens: any }
) {
    const agentData = agentInts[primaryAgent] || {}

    const googleInt = agentData.google
    const msInt = agentData.microsoft
    const metaInt = agentData.meta
    const tgInt = agentData.telegram

    return {
        telegramBotToken: tgInt?.connected ? true : (fallback.telegramBotToken ? true : false),
        googleTokens: googleInt?.connected ? {
            connected: true,
            email: (googleInt.config as any)?.email || '',
            scopes: (googleInt.config as any)?.scopes || [],
        } : (fallback.googleTokens ? {
            connected: true,
            email: (fallback.googleTokens as any)?.email || '',
            scopes: (fallback.googleTokens as any)?.scopes || [],
        } : null),
        microsoftTokens: msInt?.connected ? {
            connected: true,
            email: (msInt.config as any)?.email || '',
            displayName: (msInt.config as any)?.displayName || '',
            scopes: (msInt.config as any)?.scopes || [],
        } : (fallback.microsoftTokens ? {
            connected: true,
            email: (fallback.microsoftTokens as any)?.email || '',
            displayName: (fallback.microsoftTokens as any)?.displayName || '',
            scopes: (fallback.microsoftTokens as any)?.scopes || [],
        } : null),
        metaTokens: metaInt?.connected ? {
            connected: true,
            pageName: (metaInt.config as any)?.pageName || '',
            hasInstagram: !!(metaInt.config as any)?.instagramAccountId,
            hasAdAccount: !!(metaInt.config as any)?.adAccountId,
        } : (fallback.metaTokens && (fallback.metaTokens as any).status === 'connected' ? {
            connected: true,
            pageName: (fallback.metaTokens as any)?.pageName || '',
            hasInstagram: !!(fallback.metaTokens as any)?.instagramAccountId,
            hasAdAccount: !!(fallback.metaTokens as any)?.adAccountId,
        } : null),
    }
}

// ── Simple JWT (no external deps) ──────────────────────────

const JWT_SECRET = process.env.JWT_SECRET
if (!JWT_SECRET || JWT_SECRET === 'dev-secret-change-me') {
    console.error('FATAL: JWT_SECRET must be set in production!')
    if (process.env.NODE_ENV === 'production') process.exit(1)
}
const jwtSecret = JWT_SECRET || 'dev-secret-local-only'
const RESEND_API_KEY = process.env.RESEND_API_KEY || ''
const FROM_EMAIL = process.env.FROM_EMAIL || 'ClawFlow <onboarding@resend.dev>'
const OTP_EXPIRY_MS = 10 * 60 * 1000 // 10 minutes
const MAX_ATTEMPTS = 5
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function signJwt(payload: object, secret: string): string {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
    const sig = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url')
    return `${header}.${body}.${sig}`
}

function verifyJwt(token: string, secret: string): Record<string, unknown> | null {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const [header, body, sig] = parts
    const expected = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url')
    if (sig !== expected) return null
    try {
        return JSON.parse(Buffer.from(body, 'base64url').toString())
    } catch {
        return null
    }
}

const hashCode = (code: string): string => {
    return crypto.createHash('sha256').update(code).digest('hex')
}

// ── POST /hosting/auth/send-otp ────────────────────────────

export const sendOtpHosting = async (c: Context) => {
    try {
        const { email } = await c.req.json<{ email: string }>()

        if (!email) {
            return fail(c, 'Email is required.', 400)
        }

        if (!EMAIL_REGEX.test(email) || email.length > 255) {
            return fail(c, 'Invalid email format.', 400)
        }

        const normalizedEmail = email.toLowerCase()

        const code = String(crypto.randomInt(100000, 999999))
        const codeHash = hashCode(code)

        // Delete any existing OTP for this email
        await db.delete(otpCodes).where(eq(otpCodes.email, normalizedEmail))

        // Insert new OTP
        await db.insert(otpCodes).values({
            id: crypto.randomUUID(),
            email: normalizedEmail,
            codeHash,
            expiresAt: new Date(Date.now() + OTP_EXPIRY_MS)
        })

        // Send OTP via Resend
        if (RESEND_API_KEY) {
            const res = await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${RESEND_API_KEY}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    from: FROM_EMAIL,
                    to: normalizedEmail,
                    subject: `${code} — קוד אימות ClawFlow`,
                    html: `
                        <div dir="rtl" style="font-family:Arial,'Arial Hebrew',sans-serif;max-width:400px;margin:0 auto;padding:32px;text-align:center">
                            <h2 style="color:#111827;margin-bottom:8px">ClawFlow</h2>
                            <p style="color:#6B7280;font-size:14px;margin-bottom:24px">הקוד שלכם לכניסה לחשבון</p>
                            <div style="background:#EFF6FF;border:2px solid #2563EB;border-radius:12px;padding:20px;margin-bottom:24px">
                                <span style="font-size:32px;font-weight:700;letter-spacing:8px;color:#2563EB">${code}</span>
                            </div>
                            <p style="color:#9CA3AF;font-size:12px">הקוד תקף ל-10 דקות. אם לא ביקשתם קוד — התעלמו מהודעה זו.</p>
                        </div>
                    `,
                }),
            })

            if (!res.ok) {
                console.error('Resend error:', await res.text())
                return fail(c, 'Failed to send email.', 500)
            }
        } else {
            // Fallback: log to console
            console.log(`\n╔══════════════════════════════════════╗`)
            console.log(`║  OTP for ${normalizedEmail}: ${code}`)
            console.log(`╚══════════════════════════════════════╝\n`)
        }

        return ok(c, null, 'OTP sent successfully.')
    } catch (err) {
        console.error('sendOtpHosting error:', err)
        return fail(c, 'Failed to send OTP.', 500)
    }
}

// ── POST /hosting/auth/verify-otp ──────────────────────────

export const verifyOtpHosting = async (c: Context) => {
    try {
        const { email, code, mode } = await c.req.json<{ email: string; code: string; mode?: string }>()

        if (!email || !code) {
            return fail(c, 'Email and code are required.', 400)
        }

        const normalizedEmail = email.toLowerCase()

        // Find valid OTP record
        const record = await db
            .select()
            .from(otpCodes)
            .where(
                and(
                    eq(otpCodes.email, normalizedEmail),
                    gt(otpCodes.expiresAt, new Date())
                )
            )
            .limit(1)
            .then((rows) => rows[0])

        if (!record) {
            return fail(c, 'OTP expired or not found.', 401)
        }

        // Check max attempts
        if (record.attempts >= MAX_ATTEMPTS) {
            await db.delete(otpCodes).where(eq(otpCodes.id, record.id))
            // Alert admin about repeated failed login
            telegram.alertAdmin(`⚠️ Max OTP attempts reached: ${normalizedEmail}`).catch(() => {})
            return fail(c, 'Too many attempts. Request a new code.', 401)
        }

        // Increment attempts
        const updated = await db
            .update(otpCodes)
            .set({ attempts: sql`${otpCodes.attempts} + 1` })
            .where(
                and(
                    eq(otpCodes.id, record.id),
                    lt(otpCodes.attempts, MAX_ATTEMPTS)
                )
            )
            .returning({ attempts: otpCodes.attempts })

        if (!updated[0]) {
            return fail(c, 'Too many attempts. Request a new code.', 401)
        }

        // Verify code hash
        const codeHash = hashCode(code)
        if (codeHash !== record.codeHash) {
            const remaining = MAX_ATTEMPTS - updated[0].attempts
            return fail(c, 'Invalid code.', 401, { attemptsRemaining: remaining })
        }

        // Delete used OTP
        await db.delete(otpCodes).where(eq(otpCodes.id, record.id))

        // Find or create user
        let existingUser = await db
            .select()
            .from(users)
            .where(eq(users.email, normalizedEmail))
            .then((rows) => rows[0])

        let userId: string

        if (existingUser) {
            userId = existingUser.id
        } else if (mode === 'login') {
            return fail(c, 'no_account', 404)
        } else {
            userId = crypto.randomUUID()
            await db.insert(users).values({
                id: userId,
                email: normalizedEmail
            })
        }

        // Check if 2FA is enabled
        if (existingUser?.totpEnabled && existingUser?.totpSecret) {
            // Return partial token — needs 2FA verification
            const partialToken = signJwt(
                {
                    sub: userId,
                    email: normalizedEmail,
                    needs2fa: true,
                    iat: Math.floor(Date.now() / 1000),
                    exp: Math.floor(Date.now() / 1000) + 5 * 60 // 5 min for 2FA
                },
                jwtSecret
            )
            return ok(c, { needs2fa: true, partialToken, userId, email: normalizedEmail }, '2FA required.')
        }

        // Sign JWT
        const token = signJwt(
            {
                sub: userId,
                email: normalizedEmail,
                iat: Math.floor(Date.now() / 1000),
                exp: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60 // 30 days
            },
            jwtSecret
        )

        return ok(c, { token, userId, email: normalizedEmail }, 'OTP verified.')
    } catch (err) {
        console.error('verifyOtpHosting error:', err)
        return fail(c, 'Verification failed.', 500)
    }
}

// ── GET /hosting/auth/me ───────────────────────────────────

export const getMe = async (c: Context) => {
    try {
        const authHeader = c.req.header('Authorization')
        if (!authHeader?.startsWith('Bearer ')) {
            return fail(c, 'Unauthorized.', 401)
        }

        const token = authHeader.slice(7)
        const payload = verifyJwt(token, jwtSecret)

        if (!payload) {
            return fail(c, 'Invalid token.', 401)
        }

        // Check expiry
        if (payload.exp && typeof payload.exp === 'number' && payload.exp < Math.floor(Date.now() / 1000)) {
            return fail(c, 'Token expired.', 401)
        }

        const user = await db
            .select({
                id: users.id,
                email: users.email,
                name: users.name,
                role: users.role,
                createdAt: users.createdAt
            })
            .from(users)
            .where(eq(users.id, payload.sub as string))
            .then((rows) => rows[0])

        if (!user) {
            return fail(c, 'User not found.', 404)
        }

        return ok(c, user, 'User found.')
    } catch (err) {
        console.error('getMe error:', err)
        return fail(c, 'Failed to get user.', 500)
    }
}

// ── GET /hosting/my-instances ────────────────────────────

export const getMyInstances = async (c: Context) => {
    try {
        const authHeader = c.req.header('Authorization')
        if (!authHeader?.startsWith('Bearer ')) {
            return fail(c, 'Unauthorized.', 401)
        }

        const token = authHeader.slice(7)
        const payload = verifyJwt(token, jwtSecret)

        if (!payload || !payload.sub) {
            return fail(c, 'Invalid token.', 401)
        }

        if (payload.exp && typeof payload.exp === 'number' && payload.exp < Math.floor(Date.now() / 1000)) {
            return fail(c, 'Token expired.', 401)
        }

        const result = await db.select()
            .from(instances)
            .where(eq(instances.userId, payload.sub as string))

        // Sort: running first, then by creation date desc
        result.sort((a, b) => {
            if (a.status === 'running' && b.status !== 'running') return -1
            if (b.status === 'running' && a.status !== 'running') return 1
            return 0
        })

        // Filter out awaiting_payment
        const filtered = result.filter(i => i.status !== 'awaiting_payment')

        // Build response with per-agent integrations
        const instancesWithIntegrations = await Promise.all(filtered.map(async (i) => {
            const agentInts = await getAllIntegrationsForInstance(i.id)
            const primaryAgent = getPrimaryAgent((i.selectedComponents as string[]) || [])
            const legacy = deriveLegacyIntegrations(agentInts, primaryAgent, {
                telegramBotToken: i.telegramBotToken,
                googleTokens: i.googleTokens,
                microsoftTokens: i.microsoftTokens,
                metaTokens: i.metaTokens,
            })

            return {
                id: i.id,
                planKey: i.planKey,
                priceIls: i.priceIls,
                status: i.status,
                selectedComponents: i.selectedComponents,
                automationTool: i.automationTool,
                subdomainAgent: i.subdomainAgent,
                subdomainFlows: i.subdomainFlows,
                subdomainName: i.subdomainName,
                openclawToken: i.openclawToken,
                automationPassword: i.automationPassword,
                ip: i.ip,
                onboardingCompleted: i.onboardingCompleted,
                onboardingStep: i.onboardingStep,
                researchData: i.researchData,
                hasProfile: !!(i.researchData as any)?.answers,
                hasResearch: !!((i.researchData as any)?.report || (i.researchData as any)?.stage1),
                hasStrategy: !!(i.researchData as any)?.strategy,
                aiProviderType: i.aiProviderType,
                hasAnthropicKey: !!i.aiProviderKey,
                hasOpenaiKey: !!i.openaiApiKey,
                hasOllama: ((i.selectedComponents as string[]) || []).includes('ol'),
                hasGsc: !!i.gscTokens,
                hasDataforseo: !!i.dataforseoKey,
                hasFirecrawl: !!i.firecrawlKey,
                subAgentModels: i.subAgentModels || {},
                // Legacy integration fields (derived from agent_integrations, fallback to instances)
                ...legacy,
                // Per-agent integrations (grouped by agent type)
                agentIntegrations: agentInts,
                createdAt: i.createdAt,
            }
        }))

        return ok(c, instancesWithIntegrations, 'Instances found.')
    } catch (err) {
        console.error('getMyInstances error:', err)
        return fail(c, 'Failed to get instances.', 500)
    }
}

// ── 2FA (TOTP) ──────────────────────────────────────────────

function generateTotpSecret(): string {
    const bytes = crypto.randomBytes(20)
    // Base32 encode
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
    let result = ''
    let bits = 0
    let value = 0
    for (const byte of bytes) {
        value = (value << 8) | byte
        bits += 8
        while (bits >= 5) {
            result += alphabet[(value >>> (bits - 5)) & 31]
            bits -= 5
        }
    }
    if (bits > 0) result += alphabet[(value << (5 - bits)) & 31]
    return result
}

function generateTotp(secret: string, time?: number): string {
    const t = Math.floor((time || Date.now() / 1000) / 30)
    const buf = Buffer.alloc(8)
    buf.writeUInt32BE(0, 0)
    buf.writeUInt32BE(t, 4)

    // Base32 decode secret
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
    let bits = 0, value = 0
    const bytes: number[] = []
    for (const c of secret.toUpperCase()) {
        const idx = alphabet.indexOf(c)
        if (idx === -1) continue
        value = (value << 5) | idx
        bits += 5
        if (bits >= 8) { bytes.push((value >>> (bits - 8)) & 255); bits -= 8 }
    }
    const keyBuf = Buffer.from(bytes)

    const hmac = crypto.createHmac('sha1', keyBuf).update(buf).digest()
    const offset = hmac[hmac.length - 1] & 0x0f
    const code = ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3]
    return String(code % 1000000).padStart(6, '0')
}

function verifyTotp(secret: string, token: string): boolean {
    const now = Date.now() / 1000
    // Allow 1 step window (30 sec tolerance)
    for (let i = -1; i <= 1; i++) {
        if (generateTotp(secret, now + i * 30) === token) return true
    }
    return false
}

// POST /hosting/auth/2fa/setup — generate TOTP secret + QR URI
export const setup2fa = async (c: Context) => {
    try {
        const authHeader = c.req.header('Authorization')
        if (!authHeader?.startsWith('Bearer ')) return fail(c, 'Unauthorized.', 401)
        const payload = verifyJwt(authHeader.slice(7), jwtSecret)
        if (!payload?.sub) return fail(c, 'Invalid token.', 401)

        const userId = payload.sub as string
        const [user] = await db.select().from(users).where(eq(users.id, userId))
        if (!user) return fail(c, 'User not found.', 404)

        if (user.totpEnabled) return fail(c, '2FA already enabled.', 400)

        const secret = generateTotpSecret()
        // Save secret (not yet enabled — user must verify first)
        await db.update(users).set({ totpSecret: secret }).where(eq(users.id, userId))

        const otpauthUri = `otpauth://totp/ClawFlow:${user.email}?secret=${secret}&issuer=ClawFlow&digits=6&period=30`

        return ok(c, { secret, otpauthUri }, '2FA setup initiated. Scan QR and verify.')
    } catch (err) {
        console.error('setup2fa error:', err)
        return fail(c, 'Failed to setup 2FA.', 500)
    }
}

// POST /hosting/auth/2fa/verify-setup — verify first TOTP code and enable 2FA
export const verifySetup2fa = async (c: Context) => {
    try {
        const authHeader = c.req.header('Authorization')
        if (!authHeader?.startsWith('Bearer ')) return fail(c, 'Unauthorized.', 401)
        const payload = verifyJwt(authHeader.slice(7), jwtSecret)
        if (!payload?.sub) return fail(c, 'Invalid token.', 401)

        const { code } = await c.req.json<{ code: string }>()
        if (!code || code.length !== 6) return fail(c, 'Invalid code.', 400)

        const userId = payload.sub as string
        const [user] = await db.select().from(users).where(eq(users.id, userId))
        if (!user?.totpSecret) return fail(c, 'No 2FA secret found. Call /2fa/setup first.', 400)

        if (!verifyTotp(user.totpSecret, code)) {
            return fail(c, 'Invalid code. Try again.', 401)
        }

        await db.update(users).set({ totpEnabled: true }).where(eq(users.id, userId))
        return ok(c, null, '2FA enabled successfully.')
    } catch (err) {
        console.error('verifySetup2fa error:', err)
        return fail(c, 'Failed to verify 2FA.', 500)
    }
}

// POST /hosting/auth/2fa/verify — verify TOTP during login (exchange partial token for full token)
export const verify2fa = async (c: Context) => {
    try {
        const { partialToken, code } = await c.req.json<{ partialToken: string; code: string }>()
        if (!partialToken || !code) return fail(c, 'Token and code are required.', 400)

        const payload = verifyJwt(partialToken, jwtSecret)
        if (!payload?.sub || !payload.needs2fa) return fail(c, 'Invalid or expired token.', 401)
        if (payload.exp && typeof payload.exp === 'number' && payload.exp < Math.floor(Date.now() / 1000)) {
            return fail(c, '2FA session expired. Please login again.', 401)
        }

        const userId = payload.sub as string
        const [user] = await db.select().from(users).where(eq(users.id, userId))
        if (!user?.totpSecret || !user.totpEnabled) return fail(c, '2FA not configured.', 400)

        if (!verifyTotp(user.totpSecret, code)) {
            return fail(c, 'Invalid 2FA code.', 401)
        }

        // Issue full token
        const token = signJwt(
            {
                sub: userId,
                email: payload.email,
                iat: Math.floor(Date.now() / 1000),
                exp: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60
            },
            jwtSecret
        )

        return ok(c, { token, userId, email: payload.email }, '2FA verified.')
    } catch (err) {
        console.error('verify2fa error:', err)
        return fail(c, '2FA verification failed.', 500)
    }
}

// POST /hosting/auth/2fa/disable — disable 2FA
export const disable2fa = async (c: Context) => {
    try {
        const authHeader = c.req.header('Authorization')
        if (!authHeader?.startsWith('Bearer ')) return fail(c, 'Unauthorized.', 401)
        const payload = verifyJwt(authHeader.slice(7), jwtSecret)
        if (!payload?.sub) return fail(c, 'Invalid token.', 401)

        const { code } = await c.req.json<{ code: string }>()
        if (!code) return fail(c, 'Code required to disable 2FA.', 400)

        const userId = payload.sub as string
        const [user] = await db.select().from(users).where(eq(users.id, userId))
        if (!user?.totpSecret) return fail(c, '2FA not configured.', 400)

        if (!verifyTotp(user.totpSecret, code)) {
            return fail(c, 'Invalid code.', 401)
        }

        await db.update(users).set({ totpSecret: null, totpEnabled: false }).where(eq(users.id, userId))
        return ok(c, null, '2FA disabled.')
    } catch (err) {
        console.error('disable2fa error:', err)
        return fail(c, 'Failed to disable 2FA.', 500)
    }
}

// ── POST /hosting/auth/accept-terms ──────────────────────
export const acceptTerms = async (c: Context) => {
    try {
        const body = await c.req.json<{
            email: string
            userId: string
            timestamp: string
            userAgent: string
            documents: string[]
        }>()

        // Log to console (permanent record)
        console.log(`[TERMS ACCEPTED] ${body.email} | ${body.userId} | ${body.timestamp} | docs: ${body.documents?.join(',')} | UA: ${body.userAgent}`)

        // Send to Telegram
        try {
            const telegram = (await import('@/services/telegram')).default
            await telegram.alertAdmin(
                `📋 *תנאי שימוש אושרו*\n` +
                `Email: ${body.email}\n` +
                `User: ${body.userId}\n` +
                `Time: ${body.timestamp}\n` +
                `Docs: ${body.documents?.join(', ')}\n` +
                `UA: ${(body.userAgent || '').substring(0, 80)}`
            )
        } catch {}

        return ok(c, null, 'Terms accepted.')
    } catch (err) {
        console.error('acceptTerms error:', err)
        return ok(c, null, 'OK') // non-critical, don't block registration
    }
}
