import { t } from '@openclaw/i18n'

const formatUptime = (uptimeSeconds: number): string => {
    const days = Math.floor(uptimeSeconds / 86400)
    const hours = Math.floor((uptimeSeconds % 86400) / 3600)
    const minutes = Math.floor((uptimeSeconds % 3600) / 60)

    if (days > 0)
        return t('clawDetail.overviewUptimeDays', {
            days: String(days),
            hours: String(hours),
            minutes: String(minutes)
        })
    if (hours > 0)
        return t('clawDetail.overviewUptimeHours', {
            hours: String(hours),
            minutes: String(minutes)
        })
    return t('clawDetail.overviewUptimeMinutes', { minutes: String(minutes) })
}

export default formatUptime