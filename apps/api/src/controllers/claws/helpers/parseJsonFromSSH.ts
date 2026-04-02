const parseJsonFromSSH = (
    output: string,
    fallback: Record<string, unknown> = {}
): Record<string, unknown> => {
    try {
        const trimmed = output.trim()
        const jsonStart = trimmed.indexOf('{')
        const jsonEnd = trimmed.lastIndexOf('}')
        const jsonStr =
            jsonStart >= 0 && jsonEnd > jsonStart
                ? trimmed.substring(jsonStart, jsonEnd + 1)
                : '{}'
        return JSON.parse(jsonStr)
    } catch {
        return fallback
    }
}

export default parseJsonFromSSH