import { useState, useCallback } from 'react'
import { useUIStore } from '@/lib/store'
import { exportAgent } from '@/lib/agent-actions'

const useExportAgent = () => {
    const { showToast } = useUIStore()
    const [isExporting, setIsExporting] = useState(false)

    const trigger = useCallback(
        async (agentId: string, filename: string) => {
            setIsExporting(true)
            await exportAgent(agentId, filename, showToast)
            setIsExporting(false)
        },
        [showToast]
    )

    return { exportAgent: trigger, isExporting }
}

export default useExportAgent