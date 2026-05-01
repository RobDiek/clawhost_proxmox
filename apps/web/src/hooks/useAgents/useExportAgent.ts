import { useState, useCallback, useEffect, useRef } from 'react'
import { useUIStore } from '@/lib/store'
import { exportAgent } from '@/lib/agent-actions'

const useExportAgent = () => {
    const { showToast } = useUIStore()
    const [isExporting, setIsExporting] = useState(false)
    const controllerRef = useRef<AbortController | null>(null)

    const trigger = useCallback(
        async (agentId: string, filename: string) => {
            controllerRef.current?.abort()
            const controller = new AbortController()
            controllerRef.current = controller
            setIsExporting(true)
            await exportAgent(agentId, filename, showToast, controller.signal)
            if (controllerRef.current === controller) {
                controllerRef.current = null
                setIsExporting(false)
            }
        },
        [showToast]
    )

    useEffect(() => {
        return () => {
            controllerRef.current?.abort()
        }
    }, [])

    return { exportAgent: trigger, isExporting }
}

export default useExportAgent