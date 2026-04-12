import type { ClawMetricsResponse, MetricsHistoryPoint } from '@/ts/Interfaces'

import { useState, useRef, useEffect, useCallback } from 'react'

const HISTORY_SIZE = 60

const useMetricsHistory = (data: ClawMetricsResponse | undefined): {
    cpuHistory: MetricsHistoryPoint[]
    memHistory: MetricsHistoryPoint[]
} => {
    const cpuHistoryRef = useRef<MetricsHistoryPoint[]>([])
    const memHistoryRef = useRef<MetricsHistoryPoint[]>([])
    const [cpuHistory, setCpuHistory] = useState<MetricsHistoryPoint[]>([])
    const [memHistory, setMemHistory] = useState<MetricsHistoryPoint[]>([])

    const updateHistory = useCallback(() => {
        if (!data) return
        const now = new Date().toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        })

        cpuHistoryRef.current = [
            ...cpuHistoryRef.current,
            { time: now, value: data.cpu.usagePercent }
        ].slice(-HISTORY_SIZE)

        const memPercent =
            data.memory.total > 0
                ? Math.round((data.memory.used / data.memory.total) * 1000) / 10
                : 0

        memHistoryRef.current = [
            ...memHistoryRef.current,
            { time: now, value: memPercent }
        ].slice(-HISTORY_SIZE)

        setCpuHistory([...cpuHistoryRef.current])
        setMemHistory([...memHistoryRef.current])
    }, [data])

    useEffect(() => {
        updateHistory()
    }, [updateHistory])

    return { cpuHistory, memHistory }
}

export default useMetricsHistory