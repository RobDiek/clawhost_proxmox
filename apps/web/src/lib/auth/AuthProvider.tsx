import type { FC, ReactNode } from 'react'
import type { User, OAuthCredential } from 'firebase/auth'
import type {
    AuthProviderProps,
    CachedProfile,
    FirebaseErrorLike
} from '@/ts/Interfaces'

import { useCallback, useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
    GoogleAuthProvider,
    GithubAuthProvider,
    onAuthStateChanged,
    signInWithCustomToken,
    signInWithPopup,
    linkWithPopup,
    unlink,
    signOut as firebaseSignOut
} from 'firebase/auth'
import { t } from '@openclaw/i18n'
import { auth, AUTH_STORAGE_KEY, PROFILE_CACHE_KEY } from '@/lib/firebase'
import { api } from '@/lib'
import AuthContext from '@/lib/auth/AuthContext'
import STORAGE_KEYS from '@/lib/storageKeys'

const readCachedProfile = (): CachedProfile | null => {
    try {
        if (localStorage.getItem(AUTH_STORAGE_KEY) !== 'true') return null
        const raw = localStorage.getItem(PROFILE_CACHE_KEY)
        return raw ? JSON.parse(raw) : null
    } catch {
        return null
    }
}

const AuthProvider: FC<AuthProviderProps> = ({ children }): ReactNode => {
    const queryClient = useQueryClient()
    const [user, setUser] = useState<User | null>(null)
    const [loading, setLoading] = useState(true)
    const [cachedProfile, setCachedProfile] = useState<CachedProfile | null>(
        readCachedProfile
    )
    const updateCachedProfile = useCallback((data: Partial<CachedProfile>) => {
        setCachedProfile((prev) => {
            const updated = { ...prev, ...data } as CachedProfile
            localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(updated))
            return updated
        })
    }, [])

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            setUser(user)
            setLoading(false)

            if (user) {
                localStorage.setItem(AUTH_STORAGE_KEY, 'true')

                const cached = readCachedProfile()
                if (cached) setCachedProfile(cached)

                try {
                    const [profile] = await Promise.all([
                        queryClient.fetchQuery({
                            queryKey: ['profile'],
                            queryFn: api.getProfile
                        }),
                        queryClient.prefetchQuery({
                            queryKey: ['claws'],
                            queryFn: () => api.getClaws()
                        }),
                        queryClient.prefetchQuery({
                            queryKey: ['userStats'],
                            queryFn: api.getUserStats
                        })
                    ])
                    const fresh: CachedProfile = {
                        email: profile.email,
                        name: profile.name
                    }
                    setCachedProfile(fresh)
                    localStorage.setItem(
                        PROFILE_CACHE_KEY,
                        JSON.stringify(fresh)
                    )
                } catch {
                    await firebaseSignOut(auth)
                }
            } else {
                localStorage.removeItem(AUTH_STORAGE_KEY)
                localStorage.removeItem(PROFILE_CACHE_KEY)
                localStorage.removeItem(STORAGE_KEYS.OTP_SENT_AT)
                setCachedProfile(null)
                queryClient.clear()
            }
        })
        return unsubscribe
    }, [queryClient])

    const sendOtp = useCallback(async (email: string) => {
        await api.sendOtp(email)
    }, [])

    const verifyOtp = useCallback(async (email: string, code: string) => {
        const { customToken } = await api.verifyOtp(email, code)
        await signInWithCustomToken(auth, customToken)
    }, [])

    const resolveConflict = useCallback(
        async (credential: OAuthCredential | null, providerId: string) => {
            if (!credential?.accessToken) return false
            const { customToken } = await api.resolveCredentialConflict({
                accessToken: credential.accessToken,
                providerId
            })
            await signInWithCustomToken(auth, customToken)
            return true
        },
        []
    )

    const signInWithGoogle = useCallback(async () => {
        try {
            await signInWithPopup(auth, new GoogleAuthProvider())
        } catch (error) {
            const firebaseError = error as FirebaseErrorLike
            if (
                firebaseError.code ===
                'auth/account-exists-with-different-credential'
            ) {
                const credential = GoogleAuthProvider.credentialFromError(
                    error as Parameters<
                        typeof GoogleAuthProvider.credentialFromError
                    >[0]
                )
                const resolved = await resolveConflict(credential, 'google.com')
                if (resolved) return
            }
            throw error
        }
    }, [resolveConflict])

    const signInWithGithub = useCallback(async () => {
        try {
            await signInWithPopup(auth, new GithubAuthProvider())
        } catch (error) {
            const firebaseError = error as FirebaseErrorLike
            if (
                firebaseError.code ===
                'auth/account-exists-with-different-credential'
            ) {
                const credential = GithubAuthProvider.credentialFromError(
                    error as Parameters<
                        typeof GithubAuthProvider.credentialFromError
                    >[0]
                )
                const resolved = await resolveConflict(credential, 'github.com')
                if (resolved) return
            }
            throw error
        }
    }, [resolveConflict])

    const linkGoogle = useCallback(async () => {
        if (!user) return
        const result = await linkWithPopup(user, new GoogleAuthProvider())
        const linked = result.user.providerData.find(
            (p) => p.providerId === 'google.com'
        )
        if (
            linked?.email &&
            user.email &&
            linked.email.toLowerCase() !== user.email.toLowerCase()
        ) {
            await unlink(result.user, 'google.com')
            throw new Error(t('account.providerEmailMismatch'))
        }
    }, [user])

    const linkGithub = useCallback(async () => {
        if (!user) return
        const result = await linkWithPopup(user, new GithubAuthProvider())
        const linked = result.user.providerData.find(
            (p) => p.providerId === 'github.com'
        )
        if (
            linked?.email &&
            user.email &&
            linked.email.toLowerCase() !== user.email.toLowerCase()
        ) {
            await unlink(result.user, 'github.com')
            throw new Error(t('account.providerEmailMismatch'))
        }
    }, [user])

    const unlinkGoogle = useCallback(async () => {
        if (!user) return
        await unlink(user, 'google.com')
    }, [user])

    const unlinkGithub = useCallback(async () => {
        if (!user) return
        await unlink(user, 'github.com')
    }, [user])

    const signOut = useCallback(async () => {
        await firebaseSignOut(auth)
    }, [])

    const isLocal = document.documentElement.getAttribute('data-electron') === 'true'

    return (
        <AuthContext.Provider
            value={{
                user,
                loading,
                cachedProfile,
                updateCachedProfile,
                sendOtp,
                verifyOtp,
                signInWithGoogle,
                signInWithGithub,
                linkGoogle,
                linkGithub,
                unlinkGoogle,
                unlinkGithub,
                signOut,
                isLocal
            }}
        >
            {children}
        </AuthContext.Provider>
    )
}

export default AuthProvider