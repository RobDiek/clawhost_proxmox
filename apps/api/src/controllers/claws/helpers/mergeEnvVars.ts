const mergeEnvVars = (
    envRaw: string,
    updates: Record<string, string>
): string => {
    const existingLines: string[] = []
    const existingKeys = new Set<string>()

    envRaw.split('\n').forEach((line) => {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#')) {
            existingLines.push(line)
            return
        }
        const eqIndex = trimmed.indexOf('=')
        if (eqIndex === -1) {
            existingLines.push(line)
            return
        }
        const key = trimmed.substring(0, eqIndex).trim()
        existingKeys.add(key)

        if (key in updates) {
            const value = updates[key]
            if (value === '') return
            existingLines.push(`${key}=${value}`)
        } else {
            existingLines.push(line)
        }
    })

    Object.entries(updates).forEach(([key, value]) => {
        if (!existingKeys.has(key) && value !== '') {
            existingLines.push(`${key}=${value}`)
        }
    })

    return existingLines.join('\n')
}

export default mergeEnvVars