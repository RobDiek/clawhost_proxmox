const getUsageColor = (
    percent: number,
    colors: { high: string; medium: string; low: string } = { high: '#ef4444', medium: '#f59e0b', low: '#22c55e' }
): string => {
    if (percent > 80) return colors.high
    if (percent > 50) return colors.medium
    return colors.low
}

export default getUsageColor