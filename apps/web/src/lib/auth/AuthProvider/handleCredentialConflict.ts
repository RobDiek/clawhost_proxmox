import type { OAuthCredential } from 'firebase/auth'

import { signInWithCustomToken } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { api } from '@/lib'

const handleCredentialConflict = async (
    credential: OAuthCredential | null,
    providerId: string
): Promise<boolean> => {
    if (!credential?.accessToken) return false
    const { customToken } = await api.resolveCredentialConflict({
        accessToken: credential.accessToken,
        providerId
    })
    await signInWithCustomToken(auth, customToken)
    return true
}

export default handleCredentialConflict