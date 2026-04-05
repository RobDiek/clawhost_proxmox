import { STORAGE_KEYS } from '@/lib/constants'

const THREE_MONTHS_MS = 3 * 30 * 24 * 60 * 60 * 1000

const getReferralCode = (): string | null => {
    try {
        const raw = localStorage.getItem(STORAGE_KEYS.REFERRAL)
        if (!raw || raw === 'none') return null
        const stored = JSON.parse(raw)
        if (Date.now() - stored.timestamp > THREE_MONTHS_MS) return null
        return stored.code || null
    } catch {
        return null
    }
}

export default getReferralCode