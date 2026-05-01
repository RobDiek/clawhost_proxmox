import type { UsageColors } from '@/ts/Interfaces'

const DEFAULT_USAGE_COLORS: UsageColors = {
    high: '#ef4444',
    medium: '#f59e0b',
    low: '#22c55e'
}

const getUsageColor = (
    percent: number,
    colors: UsageColors = DEFAULT_USAGE_COLORS
): string => {
    if (percent > 80) return colors.high
    if (percent > 50) return colors.medium
    return colors.low
}

export default getUsageColor