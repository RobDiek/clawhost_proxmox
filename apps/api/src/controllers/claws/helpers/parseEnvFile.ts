const parseEnvFile = (envRaw: string): Record<string, string> => {
    const envVars: Record<string, string> = {}
    envRaw
        .trim()
        .split('\n')
        .forEach((line) => {
            const trimmed = line.trim()
            if (!trimmed || trimmed.startsWith('#')) return
            const eqIndex = trimmed.indexOf('=')
            if (eqIndex === -1) return
            const key = trimmed.substring(0, eqIndex).trim()
            let value = trimmed.substring(eqIndex + 1).trim()
            if (
                (value.startsWith('"') && value.endsWith('"')) ||
                (value.startsWith("'") && value.endsWith("'"))
            ) {
                value = value.slice(1, -1)
            }
            envVars[key] = value
        })
    return envVars
}

export default parseEnvFile