import type { Context } from 'hono'
import crypto from 'crypto'
import { eq, and, gt, lt, sql } from 'drizzle-orm'
import { db } from '@/db'
import { otpCodes, users, instances } from '@/db/schema'
import { ok, fail } from '@/lib/response'

// ── Simple JWT (no external deps) ──────────────────────────

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me'
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

        // Sign JWT
        const token = signJwt(
            {
                sub: userId,
                email: normalizedEmail,
                iat: Math.floor(Date.now() / 1000),
                exp: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60 // 30 days
            },
            JWT_SECRET
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
        const payload = verifyJwt(token, JWT_SECRET)

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
        const payload = verifyJwt(token, JWT_SECRET)

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

        return ok(c, filtered.map(i => ({
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
            hasResearch: !!(i.researchData as any)?.report,
            aiProviderType: i.aiProviderType,
            telegramBotToken: i.telegramBotToken ? true : false,
            googleTokens: i.googleTokens ? true : false,
            createdAt: i.createdAt,
        })), 'Instances found.')
    } catch (err) {
        console.error('getMyInstances error:', err)
        return fail(c, 'Failed to get instances.', 500)
    }
}
