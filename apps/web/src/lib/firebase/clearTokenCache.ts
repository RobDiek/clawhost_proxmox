import { onAuthStateChanged } from 'firebase/auth'
import auth from '@/lib/firebase/auth'
import tokenState from '@/lib/firebase/tokenState'

let unsubscribe: (() => void) | null = null

const clearTokenCache = (): void => {
    tokenState.cachedToken = null
    tokenState.tokenExpiry = 0
}

if (!unsubscribe) {
    unsubscribe = onAuthStateChanged(auth, (user) => {
        if (!user) clearTokenCache()
    })
}

export default clearTokenCache