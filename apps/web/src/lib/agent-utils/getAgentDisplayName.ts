import { agentType } from '@openclaw/shared'

const DISPLAY_NAMES: Record<string, string> = {
    [agentType.OPENCLAW]: 'OpenClaw',
    [agentType.HERMES]: 'Hermes'
}

const getAgentDisplayName = (type: string): string =>
    DISPLAY_NAMES[type] || type

export default getAgentDisplayName