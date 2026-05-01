const snakeToCamelKey = (key: string): string =>
    key.replace(/_([a-z])/g, (_, char) => char.toUpperCase())

const snakeToCamel = (obj: unknown): unknown => {
    if (Array.isArray(obj)) return obj.map(snakeToCamel)
    if (obj !== null && typeof obj === 'object') {
        return Object.fromEntries(
            Object.entries(obj as Record<string, unknown>).map(
                ([key, value]) => [snakeToCamelKey(key), snakeToCamel(value)]
            )
        )
    }
    return obj
}

export default snakeToCamel