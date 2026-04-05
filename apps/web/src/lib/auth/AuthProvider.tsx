import type { FC, ReactNode } from 'react'
import type { User, OAuthCredential } from 'firebase/auth'
import type {
    AuthProviderProps,
    CachedProfile,
    ElectronWindow,
    FirebaseErrorLike,
    OAuthWindowResult
} from '@/ts/Interfaces'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
    GoogleAuthProvider,
    GithubAuthProvider,
    onAuthStateChanged,
    signInWithCustomToken,
    signInWithCredential,
    signInWithPopup,
    linkWithPopup,
    unlink,
    signOut as firebaseSignOut
} from 'firebase/auth'
import { t } from '@openclaw/i18n'
import { auth, AUTH_STORAGE_KEY, PROFILE_CACHE_KEY } from '@/lib/firebase'
import { api, getEnv } from '@/lib'
import AuthContext from '@/lib/auth/AuthContext'
import STORAGE_KEYS from '@/lib/storageKeys'
import {
    PROFILE_QUERY_KEY,
    CLAWS_QUERY_KEY,
    USER_STATS_QUERY_KEY
} from '@/hooks'

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
    const fetchedRef = useRef(false)

    useEffect(() => {
        const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
            if (
                event.type === 'updated' &&
                event.action.type === 'success' &&
                event.query.queryKey[0] === PROFILE_QUERY_KEY[0]
            ) {
                const profile = event.query.state.data as
                    | CachedProfile
                    | undefined
                if (profile) {
                    const existing = localStorage.getItem(PROFILE_CACHE_KEY)
                    const serialized = JSON.stringify(profile)
                    if (existing !== serialized) {
                        setCachedProfile(profile)
                        localStorage.setItem(PROFILE_CACHE_KEY, serialized)
                    }
                }
            }
        })
        return unsubscribe
    }, [queryClient])

    const updateCachedProfile = useCallback((data: Partial<CachedProfile>) => {
        setCachedProfile((prev) => {
            const updated = { ...prev, ...data } as CachedProfile
            const existing = localStorage.getItem(PROFILE_CACHE_KEY)
            const serialized = JSON.stringify(updated)
            if (existing !== serialized) {
                localStorage.setItem(PROFILE_CACHE_KEY, serialized)
            }
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
                if (cached) {
                    setCachedProfile(cached)
                    queryClient.setQueryData(PROFILE_QUERY_KEY, cached)
                }

                if (fetchedRef.current) return
                fetchedRef.current = true

                try {
                    const [_profile] = await Promise.all([
                        queryClient.fetchQuery({
                            queryKey: PROFILE_QUERY_KEY,
                            queryFn: api.getProfile,
                            staleTime: 0
                        }),
                        queryClient.prefetchQuery({
                            queryKey: CLAWS_QUERY_KEY,
                            queryFn: () => api.getClaws()
                        }),
                        queryClient.prefetchQuery({
                            queryKey: USER_STATS_QUERY_KEY,
                            queryFn: api.getUserStats
                        })
                    ])
                } catch {
                    await firebaseSignOut(auth)
                }
            } else {
                fetchedRef.current = false
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

    const electronOAuth = useCallback(
        async (providerUrl: string, callbackPrefix: string) => {
            const electronAPI = (window as unknown as ElectronWindow)
                .electronAPI
            const result = (await electronAPI!.invoke(
                'oauth-window',
                providerUrl,
                callbackPrefix,
                t('auth.signIn')
            )) as OAuthWindowResult
            return result
        },
        []
    )

    const signInWithGoogle = useCallback(async () => {
        const electronAPI = (window as unknown as ElectronWindow).electronAPI

        if (electronAPI?.isDesktop) {
            const authDomain = `${getEnv('VITE_FIREBASE_PROJECT_ID')}.firebaseapp.com`
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
    }, [resolveConflict, electronOAuth])

    const signInWithGithub = useCallback(async () => {
        const electronAPI = (window as unknown as ElectronWindow).electronAPI

        if (electronAPI?.isDesktop) {
            const authDomain = `${getEnv('VITE_FIREBASE_PROJECT_ID')}.firebaseapp.com`
            const clientId = import.meta.env.VITE_GITHUB_OAUTH_CLIENT_ID
            const redirectUri = `https://${authDomain}/__/auth/handler`
            const url = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=user:email`

            const result = await electronOAuth(url, redirectUri)
            if (!result?.code) throw new Error('OAuth failed')

            const tokenResult = (await electronAPI.invoke(
                'oauth-github-exchange',
                result.code
            )) as OAuthWindowResult
            if (!tokenResult?.accessToken) throw new Error('OAuth failed')

            const credential = GithubAuthProvider.credential(
                tokenResult.accessToken
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
                        GithubAuthProvider.credentialFromError(
                            error as Parameters<
                                typeof GithubAuthProvider.credentialFromError
                            >[0]
                        ),
                        'github.com'
                    )
                    if (resolved) return
                }
                throw error
            }
            return
        }

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
    }, [resolveConflict, electronOAuth])

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

    const isLocal =
        document.documentElement.getAttribute('data-electron') === 'true'

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