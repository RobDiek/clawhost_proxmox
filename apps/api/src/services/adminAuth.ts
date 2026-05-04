/**
 * Admin auth service — 2-factor login: email OTP + TOTP.
 *
 * Whitelist: only `hello@flowmatic.co.il` accepted. Any other email = 401.
 * 2FA flow:
 *   1. POST /admin/auth/email-otp     → emails 6-digit code
 *   2. POST /admin/auth/email-verify  → returns { needsTotpSetup: true } first time
 *                                       OR { totpRequired: true } subsequently
 *   3a. First-time: GET  /admin/auth/totp-setup-qr  → returns otpauth URI + QR data URL
 *       POST /admin/auth/totp-setup    → confirms with one TOTP code, sets totp_setup_completed=true
 *   3b. Subsequent: POST /admin/auth/totp-verify    → returns final JWT (12h hard expire)
 *
 * Audit:
 *   • Every login (success/fail) writes to admin_audit
 *   • Every destructive admin action goes through writeAudit()
 */

import crypto from 'crypto'
import { eq, and, desc, gt } from 'drizzle-orm'
import jwt from 'jsonwebtoken'
// @ts-ignore — qrcode ships without types; runtime API is stable.
import QRCode from 'qrcode'

// ─── Self-contained RFC 6238 TOTP (no otplib) ────────────────────────────
// Sync, simple, predictable. Replaces otplib v13 which has plugin wiring
// issues in our ESM build. Compatible with Google Authenticator / Authy /
// 1Password (default SHA1, 6 digits, 30s step).

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

function base32Encode(buf: Buffer): string {
    let bits = 0, value = 0, output = ''
    for (let i = 0; i < buf.length; i++) {
        value = (value << 8) | buf[i]
        bits += 8
        while (bits >= 5) {
            output += BASE32[(value >>> (bits - 5)) & 0x1f]
            bits -= 5
        }
    }
    if (bits > 0) output += BASE32[(value << (5 - bits)) & 0x1f]
    return output
}

function base32Decode(s: string): Buffer {
    const cleaned = s.toUpperCase().replace(/[^A-Z2-7]/g, '')
    let bits = 0, value = 0
    const bytes: number[] = []
    for (let i = 0; i < cleaned.length; i++) {
        const idx = BASE32.indexOf(cleaned[i])
        if (idx < 0) continue
        value = (value << 5) | idx
        bits += 5
        if (bits >= 8) {
            bytes.push((value >>> (bits - 8)) & 0xff)
            bits -= 8
        }
    }
    return Buffer.from(bytes)
}

function totpGenerate(secret: string, timeStep: number, digits = 6): string {
    const key = base32Decode(secret)
    const counter = Buffer.alloc(8)
    counter.writeBigUInt64BE(BigInt(timeStep))
    const h = crypto.createHmac('sha1', key).update(counter).digest()
    const offset = h[h.length - 1] & 0x0f
    const code = ((h[offset] & 0x7f) << 24)
        | ((h[offset + 1] & 0xff) << 16)
        | ((h[offset + 2] & 0xff) << 8)
        | (h[offset + 3] & 0xff)
    return String(code % 10 ** digits).padStart(digits, '0')
}

const authenticator = {
    /** 20-byte (160-bit) random secret, base32-encoded — RFC 4226 recommended */
    generateSecret: (): string => base32Encode(crypto.randomBytes(20)),

    /** otpauth URI consumable by Google Authenticator, etc. */
    keyuri: (account: string, issuer: string, secret: string): string => {
        const lbl = encodeURIComponent(`${issuer}:${account}`)
        const iss = encodeURIComponent(issuer)
        return `otpauth://totp/${lbl}?secret=${secret}&issuer=${iss}&algorithm=SHA1&digits=6&period=30`
    },

    /** Verify with ±1 window (60s grace) for clock drift */
    check: (token: string, secret: string): boolean => {
        if (!token || !secret) return false
        const t = String(token).trim()
        if (!/^\d{6}$/.test(t)) return false
        const now = Math.floor(Date.now() / 1000 / 30)
        for (let w = -1; w <= 1; w++) {
            try {
                if (totpGenerate(secret, now + w) === t) return true
            } catch { /* ignore and continue */ }
        }
        return false
    },
}
import { db } from '@/db'
import { adminUsers, adminSessions, adminAudit, otpCodes } from '@/db/schema'
import { getResend, FROM_EMAIL } from '@/services/resend'

export const ADMIN_EMAIL = 'hello@flowmatic.co.il'
const OTP_EXPIRY_MS = 10 * 60 * 1000          // 10 min
const SESSION_EXPIRY_MS = 12 * 60 * 60 * 1000  // 12 hours hard

// ─── Whitelist + bootstrap admin ─────────────────────────────────────────

export async function ensureAdminBootstrap(): Promise<void> {
    const [existing] = await db.select().from(adminUsers).where(eq(adminUsers.email, ADMIN_EMAIL))
    if (!existing) {
        await db.insert(adminUsers).values({
            email: ADMIN_EMAIL,
            totpSetupCompleted: false,
        })
        console.log(`[adminAuth] bootstrapped admin row for ${ADMIN_EMAIL}`)
    }
}

export function isAdminEmail(email: string): boolean {
    return (email || '').trim().toLowerCase() === ADMIN_EMAIL
}

// ─── Email OTP ────────────────────────────────────────────────────────────

function hashOtp(code: string): string {
    return crypto.createHash('sha256').update(code).digest('hex')
}

export async function sendEmailOtp(email: string): Promise<void> {
    if (!isAdminEmail(email)) {
        // Pretend success but never email — prevents email enumeration
        console.warn(`[adminAuth] non-whitelisted attempt for ${email}`)
        return
    }
    await ensureAdminBootstrap()

    const code = String(crypto.randomInt(100000, 999999))
    const codeHash = hashOtp(code)

    await db.delete(otpCodes).where(eq(otpCodes.email, ADMIN_EMAIL))
    await db.insert(otpCodes).values({
        id: crypto.randomUUID(),
        email: ADMIN_EMAIL,
        codeHash,
        expiresAt: new Date(Date.now() + OTP_EXPIRY_MS),
    })

    const html = `<!DOCTYPE html><html dir="rtl"><body style="font-family:Arial;background:#0F172A;color:#fff;padding:32px">
<div style="max-width:480px;margin:0 auto;background:#1E293B;border-radius:14px;padding:30px;border:1px solid #334155">
  <h2 style="color:#fff;margin:0 0 14px;font-size:1.3rem">🔐 ClawFlow Admin Access</h2>
  <p style="color:#94A3B8;font-size:0.95rem;line-height:1.7;margin:0 0 18px">
    קוד גישה חד-פעמי לפאנל הניהול. תקף ל-10 דקות.
  </p>
  <div style="background:#0F172A;border:1px solid #475569;border-radius:10px;padding:18px;text-align:center;margin:20px 0">
    <div style="font-family:'SF Mono',Consolas,monospace;font-size:2.4rem;font-weight:700;color:#60A5FA;letter-spacing:0.4em">${code}</div>
  </div>
  <p style="color:#64748B;font-size:0.78rem;line-height:1.6;margin:14px 0 0">
    אם לא ניסיתם להיכנס — התעלמו מהמייל. הגישה מוגבלת רק ל-${ADMIN_EMAIL}.
  </p>
</div>
</body></html>`

    await getResend().emails.send({
        from: FROM_EMAIL,
        to: ADMIN_EMAIL,
        subject: '🔐 ClawFlow Admin — קוד גישה',
        html,
        text: `Admin access code: ${code}\nValid for 10 minutes. Ignore if not requested.`,
    })
}

export async function verifyEmailOtp(email: string, code: string): Promise<{
    ok: boolean
    needsTotpSetup?: boolean
    totpRequired?: boolean
    intermediateToken?: string  // JWT scoped to "totp-pending" stage
    reason?: string
}> {
    if (!isAdminEmail(email)) return { ok: false, reason: 'unauthorized' }

    const codeHash = hashOtp(code)
    const [row] = await db.select().from(otpCodes)
        .where(and(eq(otpCodes.email, ADMIN_EMAIL), eq(otpCodes.codeHash, codeHash)))
        .limit(1)
    if (!row) return { ok: false, reason: 'invalid code' }
    if (row.expiresAt < new Date()) return { ok: false, reason: 'code expired' }

    await db.delete(otpCodes).where(eq(otpCodes.id, row.id))

    const [admin] = await db.select().from(adminUsers).where(eq(adminUsers.email, ADMIN_EMAIL))
    if (!admin) return { ok: false, reason: 'admin row missing' }

    // Stage-2 token: short-lived, scoped only for TOTP step
    const intermediateToken = jwt.sign(
        { adminId: admin.id, stage: 'totp-pending' },
        process.env.JWT_SECRET || 'change-me',
        { expiresIn: '10m' },
    )

    return {
        ok: true,
        needsTotpSetup: !admin.totpSetupCompleted,
        totpRequired: !!admin.totpSetupCompleted,
        intermediateToken,
    }
}

// ─── TOTP setup (first login) ─────────────────────────────────────────────

export async function generateTotpSetup(intermediateToken: string): Promise<{
    ok: boolean
    secret?: string
    otpauthUri?: string
    qrDataUrl?: string
    reason?: string
}> {
    const decoded = verifyIntermediate(intermediateToken)
    if (!decoded) return { ok: false, reason: 'invalid stage token' }

    // Generate fresh secret each time the setup endpoint is called UNLESS one already exists.
    const [admin] = await db.select().from(adminUsers).where(eq(adminUsers.id, decoded.adminId))
    if (!admin) return { ok: false, reason: 'admin not found' }
    if (admin.totpSetupCompleted) return { ok: false, reason: 'totp already setup; use verify endpoint' }

    let secret = admin.totpSecret
    if (!secret) {
        secret = authenticator.generateSecret()
        await db.update(adminUsers)
            .set({ totpSecret: secret })
            .where(eq(adminUsers.id, admin.id))
    }
    const otpauthUri = authenticator.keyuri(ADMIN_EMAIL, 'ClawFlow Admin', secret)
    const qrDataUrl = await QRCode.toDataURL(otpauthUri, { margin: 1, scale: 6 })

    return { ok: true, secret, otpauthUri, qrDataUrl }
}

export async function confirmTotpSetup(
    intermediateToken: string,
    code: string,
    ip: string,
    userAgent: string,
): Promise<{ ok: boolean; jwt?: string; reason?: string }> {
    const decoded = verifyIntermediate(intermediateToken)
    if (!decoded) return { ok: false, reason: 'invalid stage token' }
    const [admin] = await db.select().from(adminUsers).where(eq(adminUsers.id, decoded.adminId))
    if (!admin || !admin.totpSecret) return { ok: false, reason: 'no secret pending' }

    if (!authenticator.check(code, admin.totpSecret)) {
        await writeAudit({ adminId: admin.id, action: 'admin.login.totp_setup_fail', ip })
        return { ok: false, reason: 'wrong totp code' }
    }
    await db.update(adminUsers)
        .set({ totpSetupCompleted: true, lastLoginAt: new Date() })
        .where(eq(adminUsers.id, admin.id))

    const jwtToken = await issueSession(admin.id, ip, userAgent)
    await writeAudit({ adminId: admin.id, action: 'admin.login.success_first_setup', ip, details: { userAgent } })
    return { ok: true, jwt: jwtToken }
}

// ─── TOTP verify (subsequent logins) ──────────────────────────────────────

export async function verifyTotp(
    intermediateToken: string,
    code: string,
    ip: string,
    userAgent: string,
): Promise<{ ok: boolean; jwt?: string; reason?: string }> {
    const decoded = verifyIntermediate(intermediateToken)
    if (!decoded) return { ok: false, reason: 'invalid stage token' }
    const [admin] = await db.select().from(adminUsers).where(eq(adminUsers.id, decoded.adminId))
    if (!admin || !admin.totpSecret || !admin.totpSetupCompleted) return { ok: false, reason: 'totp not configured' }

    if (!authenticator.check(code, admin.totpSecret)) {
        await writeAudit({ adminId: admin.id, action: 'admin.login.totp_fail', ip })
        return { ok: false, reason: 'wrong totp code' }
    }
    await db.update(adminUsers)
        .set({ lastLoginAt: new Date() })
        .where(eq(adminUsers.id, admin.id))

    const jwtToken = await issueSession(admin.id, ip, userAgent)
    await writeAudit({ adminId: admin.id, action: 'admin.login.success', ip, details: { userAgent } })
    return { ok: true, jwt: jwtToken }
}

// ─── Session / JWT ────────────────────────────────────────────────────────

function verifyIntermediate(token: string): { adminId: string; stage: string } | null {
    try {
        const d = jwt.verify(token, process.env.JWT_SECRET || 'change-me') as any
        if (d?.stage !== 'totp-pending') return null
        return { adminId: d.adminId, stage: d.stage }
    } catch { return null }
}

async function issueSession(adminId: string, ip: string, userAgent: string): Promise<string> {
    const expiresAt = new Date(Date.now() + SESSION_EXPIRY_MS)
    const token = jwt.sign(
        { adminId, stage: 'admin', iat: Math.floor(Date.now() / 1000) },
        process.env.JWT_SECRET || 'change-me',
        { expiresIn: '12h' },
    )
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
    await db.insert(adminSessions).values({ adminId, tokenHash, expiresAt, ip, userAgent })
    return token
}

export async function verifyAdminJwt(token: string, ip?: string): Promise<{
    ok: boolean
    adminId?: string
    reason?: string
}> {
    try {
        const d = jwt.verify(token, process.env.JWT_SECRET || 'change-me') as any
        if (d?.stage !== 'admin') return { ok: false, reason: 'wrong stage' }

        const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
        const [session] = await db.select().from(adminSessions)
            .where(and(eq(adminSessions.tokenHash, tokenHash), gt(adminSessions.expiresAt, new Date())))
            .limit(1)
        if (!session) return { ok: false, reason: 'session not found / expired' }
        if (session.revokedAt) return { ok: false, reason: 'session revoked' }
        return { ok: true, adminId: session.adminId }
    } catch (err) {
        return { ok: false, reason: (err as Error).message }
    }
}

export async function revokeSession(token: string): Promise<void> {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
    await db.update(adminSessions)
        .set({ revokedAt: new Date() })
        .where(eq(adminSessions.tokenHash, tokenHash))
}

// ─── Audit log ────────────────────────────────────────────────────────────

export async function writeAudit(args: {
    adminId?: string | null
    action: string
    targetType?: string
    targetId?: string
    details?: any
    ip?: string
}): Promise<void> {
    try {
        await db.insert(adminAudit).values({
            adminId: args.adminId || null,
            action: args.action,
            targetType: args.targetType || null,
            targetId: args.targetId || null,
            details: args.details || null,
            ip: args.ip || null,
        } as any)
    } catch (err) {
        console.warn('[adminAudit] write failed:', (err as Error).message)
    }
}

export async function listAudit(limit = 100): Promise<any[]> {
    return await db.select().from(adminAudit)
        .orderBy(desc(adminAudit.createdAt))
        .limit(limit)
}