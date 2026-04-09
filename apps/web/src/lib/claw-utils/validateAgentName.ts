import type { TranslationKey } from '@openclaw/i18n'

const validateAgentName = (
    name: string,
    existingNames: string[],
    currentName?: string
): TranslationKey | null => {
    if (!name.trim()) {
        return 'playground.agentNameRequired'
    }

    if (!/^[a-zA-Z0-9-]+$/.test(name)) {
        return 'playground.agentNameInvalidChars'
    }

    const isDuplicate = existingNames.some(
        (n) =>
            n.toLowerCase() === name.toLowerCase() &&
            (!currentName || n.toLowerCase() !== currentName.toLowerCase())
    )

    if (isDuplicate) return 'playground.agentNameDuplicate'

    return null
}

export default validateAgentName