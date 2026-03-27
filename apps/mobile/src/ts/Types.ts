export type ToastType = 'success' | 'error' | 'warning' | 'info'

import type { clawStatus } from '@openclaw/shared'

export type ClawStatus = (typeof clawStatus)[keyof typeof clawStatus]

export type UserRole = 'user' | 'admin'

export type RootTabParamList = {
    Claws: undefined
    Account: undefined
}