import type { ElectronWindow, FirebaseErrorLike } from '@/ts/Interfaces'
import type { ElectronOAuthFn, ResolveConflictFn } from '@/ts/Types'

import {
    GoogleAuthProvider,
    signInWithCredential,
    signInWithRedirect
} from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { Envs } from '@/lib'

const signInWithGoogle = async (
    resolveConflict: ResolveConflictFn,
    electronOAuth: ElectronOAuthFn
): Promise<void> => {
    const electronAPI = (window as unknown as ElectronWindow).electronAPI

    if (electronAPI?.isDesktop) {
        const authDomain = `${Envs.VITE_FIREBASE_PROJECT_ID}.firebaseapp.com`
        const clientId = import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID
        const redirectUri = `https://${authDomain}/__/auth/handler`
        const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=token&scope=openid+email+profile&prompt=select_account`

        const result = await electronOAuth(url, redirectUri)
        if (!result?.accessToken) throw new Error('OAuth failed')

        const credential = GoogleAuthProvider.credential(
            null,
            result.accessToken
        )
        try {
            await signInWithCredential(auth, credential)
        } catch (error) {
            const firebaseError = error as FirebaseErrorLike
            if (
                firebaseError.code ===
                'auth/account-exists-with-different-credential'
            ) {
                const resolved = await resolveConflict(
                    GoogleAuthProvider.credentialFromError(
                        error as Parameters<
                            typeof GoogleAuthProvider.credentialFromError
                        >[0]
                    ),
                    'google.com'
                )
                if (resolved) return
            }
            throw error
        }
        return
    }

    await signInWithRedirect(auth, new GoogleAuthProvider())
}

export default signInWithGoogle