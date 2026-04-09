import type { TranslationKey } from '@openclaw/i18n'
import type { UseAgentNameValidationReturn } from '@/ts/Interfaces'

import { useState, useCallback } from 'react'
import { validateAgentName } from '@/lib/claw-utils'

const useAgentNameValidation = (
    existingAgentNames: string[]
): UseAgentNameValidationReturn => {
    const [name, setName] = useState('')
    const [nameError, setNameError] = useState<TranslationKey | null>(null)

    const handleNameChange = useCallback(
        (value: string) => {
            setName(value)
            if (value.trim()) {
                const error = validateAgentName(value, existingAgentNames)
                setNameError(error)
            } else {
                setNameError(null)
            }
        },
        [existingAgentNames]
    )

    const reset = useCallback(() => {
        setName('')
        setNameError(null)
    }, [])

    return { name, nameError, handleNameChange, setNameError, reset }
}

export default useAgentNameValidation