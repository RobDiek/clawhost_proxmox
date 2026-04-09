import type { UseOtpFlowParams, UseOtpFlowReturn } from '@/ts/Interfaces'
import type { LoginLoadingMethod, OAuthProvider } from '@/ts/Types'

import { useCallback, useEffect, useRef, useState } from 'react'
import { t } from '@openclaw/i18n'
import { inputValidation } from '@openclaw/shared'
import { useAuth } from '@/lib/auth'
import { useUIStore } from '@/lib/store'
import {
    LOGIN_LOADING_METHOD,
    OAUTH_PROVIDER,
    TOAST_TYPE
} from '@/lib/constants'

const CODE_LENGTH = 6
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const useOtpFlow = ({
    email,
    cooldown,
    startCooldown,
    onCodeSent
}: UseOtpFlowParams): UseOtpFlowReturn => {
    const [code, setCode] = useState<string[]>(Array(CODE_LENGTH).fill(''))
    const [loadingMethod, setLoadingMethod] = useState<LoginLoadingMethod>(null)
    const [codeError, setCodeError] = useState(false)
    const [emailError, setEmailError] = useState('')
    const inputRefs = useRef<(HTMLInputElement | null)[]>([])
    const pastedRef = useRef(false)
    const { sendOtp, verifyOtp, signInWithGoogle, signInWithGithub } = useAuth()
    const { showToast } = useUIStore()

    const resetCode = useCallback(() => {
        setCode(Array(CODE_LENGTH).fill(''))
        setCodeError(false)
    }, [])

    const handleSendOtp = useCallback(async () => {
        if (loadingMethod || cooldown > 0) return

        const trimmed = email.trim()
        if (
            !trimmed ||
            !EMAIL_REGEX.test(trimmed) ||
            trimmed.length > inputValidation.EMAIL.MAX
        ) {
            setEmailError(t('auth.invalidEmailFormat'))
            return
        }

        setEmailError('')
        setLoadingMethod(LOGIN_LOADING_METHOD.EMAIL)
        try {
            await sendOtp(email.trim())
            startCooldown()
            onCodeSent()
            setCode(Array(CODE_LENGTH).fill(''))
            setCodeError(false)
            setTimeout(() => inputRefs.current[0]?.focus(), 100)
        } catch (err: unknown) {
            const message =
                err instanceof Error
                    ? err.message
                    : t('errors.somethingWentWrong')
            showToast(message, TOAST_TYPE.ERROR)
        } finally {
            setLoadingMethod(null)
        }
    }, [
        email,
        loadingMethod,
        cooldown,
        sendOtp,
        startCooldown,
        showToast,
        onCodeSent
    ])

    const handleVerifyOtp = useCallback(
        async (fullCode: string) => {
            if (loadingMethod) return
            setLoadingMethod(LOGIN_LOADING_METHOD.EMAIL)
            setCodeError(false)
            try {
                await verifyOtp(email.trim(), fullCode)
            } catch (err: unknown) {
                const message =
                    err instanceof Error ? err.message : t('auth.invalidCode')
                showToast(message, TOAST_TYPE.ERROR)
                setCodeError(true)
                setCode(Array(CODE_LENGTH).fill(''))
                inputRefs.current[0]?.focus()
            } finally {
                setLoadingMethod(null)
            }
        },
        [email, loadingMethod, verifyOtp, showToast]
    )

    useEffect(() => {
        if (pastedRef.current && code.every((d) => d !== '')) {
            pastedRef.current = false
            handleVerifyOtp(code.join(''))
        }
    }, [code, handleVerifyOtp])

    const handleCodeChange = useCallback(
        (value: string, index: number) => {
            if (!/^\d*$/.test(value)) return

            const newCode = [...code]

            if (value.length > 1) {
                const digits = value.split('').slice(0, CODE_LENGTH)
                digits.forEach((digit, i) => {
                    if (index + i < CODE_LENGTH) {
                        newCode[index + i] = digit
                    }
                })
                if (newCode.every((d) => d !== '')) {
                    pastedRef.current = true
                }
                setCode(newCode)
                setCodeError(false)
                const nextIndex = Math.min(
                    index + digits.length,
                    CODE_LENGTH - 1
                )
                inputRefs.current[nextIndex]?.focus()
                return
            }

            newCode[index] = value
            setCode(newCode)
            setCodeError(false)

            if (value && index < CODE_LENGTH - 1) {
                inputRefs.current[index + 1]?.focus()
            }
        },
        [code]
    )

    const isCodeComplete = code.every((d) => d !== '')

    const handleCodeKeyDown = useCallback(
        (key: string, index: number) => {
            if (key === 'Enter' && isCodeComplete) {
                handleVerifyOtp(code.join(''))
                return
            }
            if (key === 'Backspace' && !code[index] && index > 0) {
                const newCode = [...code]
                newCode[index - 1] = ''
                setCode(newCode)
                inputRefs.current[index - 1]?.focus()
            }
        },
        [code, isCodeComplete, handleVerifyOtp]
    )

    const handleResend = useCallback(async () => {
        if (cooldown > 0 || loadingMethod) return
        setLoadingMethod(LOGIN_LOADING_METHOD.RESEND)
        try {
            await sendOtp(email.trim())
            startCooldown()
            setCode(Array(CODE_LENGTH).fill(''))
            setCodeError(false)
            inputRefs.current[0]?.focus()
        } catch (err: unknown) {
            const message =
                err instanceof Error
                    ? err.message
                    : t('errors.somethingWentWrong')
            showToast(message, TOAST_TYPE.ERROR)
        } finally {
            setLoadingMethod(null)
        }
    }, [cooldown, loadingMethod, email, sendOtp, startCooldown, showToast])

    const handleOAuth = useCallback(
        async (provider: OAuthProvider) => {
            if (loadingMethod) return
            setLoadingMethod(provider)
            try {
                if (provider === OAUTH_PROVIDER.GOOGLE) {
                    await signInWithGoogle()
                } else {
                    await signInWithGithub()
                }
            } catch (err: unknown) {
                const message =
                    err instanceof Error
                        ? err.message
                        : t('errors.somethingWentWrong')
                showToast(message, TOAST_TYPE.ERROR)
            } finally {
                setLoadingMethod(null)
            }
        },
        [loadingMethod, signInWithGoogle, signInWithGithub, showToast]
    )

    return {
        code,
        codeError,
        emailError,
        loadingMethod,
        isCodeComplete,
        inputRefs,
        setEmailError,
        handleSendOtp,
        handleVerifyOtp,
        handleCodeChange,
        handleCodeKeyDown,
        handleResend,
        handleOAuth,
        resetCode
    }
}

export default useOtpFlow