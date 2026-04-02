const parseJsonArrayFromSSH = <T = unknown>(
    output: string,
    arrayKey?: string
): T[] => {
    try {
        const trimmed = output.trim()
        const arrStart = trimmed.indexOf('[')
        const objStart = trimmed.indexOf('{')
        const start =
            arrStart >= 0 && (objStart < 0 || arrStart < objStart)
                ? arrStart
                : objStart
        const end =
            start === arrStart
                ? trimmed.lastIndexOf(']')
                : trimmed.lastIndexOf('}')
        const jsonStr =
            start >= 0 && end > start ? trimmed.substring(start, end + 1) : '[]'
        const parsed = JSON.parse(jsonStr)
        if (Array.isArray(parsed)) return parsed
        return arrayKey ? parsed[arrayKey] || [] : []
    } catch {
        return []
    }
}

export default parseJsonArrayFromSSH