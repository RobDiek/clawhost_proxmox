import type { CachedProfile } from '@/ts/Interfaces'

import { AUTH_STORAGE_KEY, PROFILE_CACHE_KEY } from '@/lib/firebase'

const readCachedProfile = (): CachedProfile | null => {
    try {
        if (localStorage.getItem(AUTH_STORAGE_KEY) !== 'true') return null
        const raw = localStorage.getItem(PROFILE_CACHE_KEY)
        return raw ? JSON.parse(raw) : null
    } catch {
        return null
    }
}

export default readCachedProfile