import type {
    UseCreateAgentFormReturn,
    UseCreateAgentFormValues,
    UseCreateAgentFormErrors
} from '@/ts/Interfaces'

import { useState, useCallback } from 'react'
import { t } from '@openclaw/i18n'
import { agentType, billingInterval } from '@openclaw/shared'
import { generatePassword, generateToken } from '@/lib/agent-utils'

const buildInitialValues = (
    initialPlanId: string,
    initialLocation: string
): UseCreateAgentFormValues => ({
    name: '',
    agentType: agentType.OPENCLAW,
    planId: initialPlanId,
    location: initialLocation,
    password: generatePassword(),
    showPassword: false,
    gatewayToken: generateToken(),
    showGatewayToken: false,
    selectedSshKeyId: '',
    volumeSize: 0,
    billingCycle: billingInterval.YEAR,
    showAdvanced: false,
    agreedToTerms: false
})

const useCreateAgentForm = (
    initialPlanId: string,
    initialLocation: string
): UseCreateAgentFormReturn => {
    const [values, setValues] = useState<UseCreateAgentFormValues>(() =>
        buildInitialValues(initialPlanId, initialLocation)
    )
    const [errors, setErrors] = useState<UseCreateAgentFormErrors>({ name: '' })

    const setField = useCallback(
        <K extends keyof UseCreateAgentFormValues>(
            key: K,
            value: UseCreateAgentFormValues[K]
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

export default useCreateAgentForm