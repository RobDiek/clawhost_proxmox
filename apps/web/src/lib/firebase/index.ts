import auth from '@/lib/firebase/auth'
import getCachedToken from '@/lib/firebase/getCachedToken'
import clearTokenCache from '@/lib/firebase/clearTokenCache'
import AUTH_STORAGE_KEY from '@/lib/firebase/AUTH_STORAGE_KEY'
import PROFILE_CACHE_KEY from '@/lib/firebase/PROFILE_CACHE_KEY'

export {
    auth,
    getCachedToken,
    clearTokenCache,
    AUTH_STORAGE_KEY,
    PROFILE_CACHE_KEY
}