import { clawStatus } from '@openclaw/shared'

const mapStatus = (hetznerStatus: string): string => {
    const statusMap: Record<string, string> = {
        off: clawStatus.stopped,
        init: clawStatus.initializing
    }
    return statusMap[hetznerStatus] || hetznerStatus
}

export default mapStatus