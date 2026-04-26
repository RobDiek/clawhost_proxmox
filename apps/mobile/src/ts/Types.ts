export type ToastType = 'success' | 'error' | 'warning' | 'info'

import type { agentStatus } from '@openclaw/shared'

export type AgentStatus = (typeof agentStatus)[keyof typeof agentStatus]

export type UserRole = 'user' | 'admin'

export type RootTabParamList = {
    Claws: undefined
    Account: undefined
}