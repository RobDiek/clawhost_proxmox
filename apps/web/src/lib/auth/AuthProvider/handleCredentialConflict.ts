import type { OAuthCredential } from 'firebase/auth'
import type { PendingConflict } from '@/ts/Interfaces'

const handleCredentialConflict = (
    credential: OAuthCredential | null,
    providerId: string,
    conflictEmail: string | undefined
): PendingConflict | null => {
    if (!credential?.accessToken || !conflictEmail) return null
    return {
        accessToken: credential.accessToken,
        providerId,
        email: conflictEmail
    }
}

export default handleCredentialConflict