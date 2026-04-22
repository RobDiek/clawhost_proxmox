import { agentStatus } from '@openclaw/shared'

const mapStatus = (hetznerStatus: string): string => {
    const statusMap: Record<string, string> = {
        off: agentStatus.stopped,
        init: agentStatus.initializing
    }
    return statusMap[hetznerStatus] || hetznerStatus
}

export default mapStatus