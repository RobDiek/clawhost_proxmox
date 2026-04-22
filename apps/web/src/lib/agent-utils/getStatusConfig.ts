import type { StatusConfig } from '@/ts/Interfaces'

import { t } from '@openclaw/i18n'
import { agentStatus } from '@openclaw/shared'

const getStatusConfig = (): Record<string, StatusConfig> => {
    return {
        [agentStatus.running]: {
            color: 'bg-green-500',
            bgColor: 'bg-green-500/10',
            label: t('dashboard.status.running')
        },
        [agentStatus.stopped]: {
            color: 'bg-red-500',
            bgColor: 'bg-red-500/10',
            label: t('dashboard.status.stopped')
        },
        [agentStatus.starting]: {
            color: 'bg-yellow-500',
            bgColor: 'bg-yellow-500/10',
            label: t('dashboard.status.starting'),
            pulse: true
        },
        [agentStatus.stopping]: {
            color: 'bg-yellow-500',
            bgColor: 'bg-yellow-500/10',
            label: t('dashboard.status.stopping'),
            pulse: true
        },
        [agentStatus.creating]: {
            color: 'bg-blue-500',
            bgColor: 'bg-blue-500/10',
            label: t('dashboard.status.creating'),
            pulse: true
        },
        [agentStatus.configuring]: {
            color: 'bg-blue-500',
            bgColor: 'bg-blue-500/10',
            label: t('dashboard.status.configuring'),
            pulse: true
        },
        [agentStatus.initializing]: {
            color: 'bg-blue-500',
            bgColor: 'bg-blue-500/10',
            label: t('dashboard.status.initializing'),
            pulse: true
        },
        [agentStatus.migrating]: {
            color: 'bg-purple-500',
            bgColor: 'bg-purple-500/10',
            label: t('dashboard.status.migrating'),
            pulse: true
        },
        [agentStatus.rebuilding]: {
            color: 'bg-yellow-500',
            bgColor: 'bg-yellow-500/10',
            label: t('dashboard.status.rebuilding'),
            pulse: true
        },
        [agentStatus.restarting]: {
            color: 'bg-yellow-500',
            bgColor: 'bg-yellow-500/10',
            label: t('dashboard.status.restarting'),
            pulse: true
        },
        [agentStatus.unreachable]: {
            color: 'bg-red-500',
            bgColor: 'bg-red-500/10',
            label: t('dashboard.status.unreachable')
        },
        [agentStatus.deleting]: {
            color: 'bg-red-500',
            bgColor: 'bg-red-500/10',
            label: t('dashboard.status.deleting'),
            pulse: true
        },
        [agentStatus.awaitingPayment]: {
            color: 'bg-yellow-500',
            bgColor: 'bg-yellow-500/10',
            label: t('dashboard.status.awaitingPayment'),
            pulse: true
        },
        [agentStatus.unknown]: {
            color: 'bg-gray-400',
            bgColor: 'bg-gray-400/10',
            label: t('dashboard.status.unknown')
        }
    }
}

export default getStatusConfig