import crypto from 'crypto'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { claws } from '@/db/schema'

const memoryCache = new Map<string, string>()

const fingerprint = (key: Buffer): string =>
    crypto.createHash('sha256').update(key).digest('hex')

const get = async (ip: string): Promise<string | null> => {
    const cached = memoryCache.get(ip)
    if (cached) return cached

    const result = await db
        .select({ hostKeyFingerprint: claws.hostKeyFingerprint })
        .from(claws)
        .where(eq(claws.ip, ip))
        .limit(1)

    const stored = result[0]?.hostKeyFingerprint
    if (stored) memoryCache.set(ip, stored)
    return stored || null
}

const store = async (ip: string, key: Buffer): Promise<void> => {
    const fp = fingerprint(key)
    memoryCache.set(ip, fp)

    await db
        .update(claws)
        .set({ hostKeyFingerprint: fp })
        .where(eq(claws.ip, ip))
}

const verify = async (ip: string, key: Buffer): Promise<boolean> => {
    const expected = await get(ip)
    const actual = fingerprint(key)

    if (!expected) {
        await store(ip, key)
        return true
    }

    return crypto.timingSafeEqual(
        Buffer.from(expected, 'hex'),
        Buffer.from(actual, 'hex')
    )
}

const clear = (ip: string): void => {
    memoryCache.delete(ip)
}

export default { get, store, verify, clear, fingerprint }