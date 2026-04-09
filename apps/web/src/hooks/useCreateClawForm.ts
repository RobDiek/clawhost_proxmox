import type {
    UseCreateClawFormReturn,
    UseCreateClawFormValues,
    UseCreateClawFormErrors
} from '@/ts/Interfaces'

import { useState, useCallback } from 'react'
import { t } from '@openclaw/i18n'
import { billingInterval } from '@openclaw/shared'
import { generatePassword } from '@/lib/claw-utils'

const buildInitialValues = (
    initialPlanId: string,
    initialLocation: string
): UseCreateClawFormValues => ({
    name: '',
    planId: initialPlanId,
    location: initialLocation,
    password: generatePassword(),
    showPassword: false,
    selectedSshKeyId: '',
    volumeSize: 0,
    billingCycle: billingInterval.YEAR,
    showAdvanced: false,
    agreedToTerms: false
})

const useCreateClawForm = (
    initialPlanId: string,
    initialLocation: string
): UseCreateClawFormReturn => {
    const [values, setValues] = useState<UseCreateClawFormValues>(() =>
        buildInitialValues(initialPlanId, initialLocation)
    )
    const [errors, setErrors] = useState<UseCreateClawFormErrors>({ name: '' })

    const setField = useCallback(
        <K extends keyof UseCreateClawFormValues>(
            key: K,
            value: UseCreateClawFormValues[K]
        ) => {
            setValues((prev) => ({ ...prev, [key]: value }))
            if (key === 'name') {
                const val = value as string
                if (val && !/^[a-zA-Z0-9-]+$/.test(val)) {
                    setErrors({ name: t('createClaw.clawNameInvalidChars') })
                } else {
                    setErrors({ name: '' })
                }
            }
        },
        []
    )

    const reset = useCallback(() => {
        setValues(buildInitialValues(initialPlanId, initialLocation))
        setErrors({ name: '' })
    }, [initialPlanId, initialLocation])

    return { values, errors, setField, reset }
}

export default useCreateClawForm