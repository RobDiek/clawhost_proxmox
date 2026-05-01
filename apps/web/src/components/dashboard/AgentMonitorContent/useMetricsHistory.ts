import type {
    AgentMetricsResponse,
    MetricsHistoryPoint,
    UseMetricsHistoryReturn
} from '@/ts/Interfaces'

import { useState, useRef, useEffect, useCallback } from 'react'

const HISTORY_SIZE = 60

const useMetricsHistory = (
    data: AgentMetricsResponse | undefined
): UseMetricsHistoryReturn => {
    const cpuHistoryRef = useRef<MetricsHistoryPoint[]>([])
    const memHistoryRef = useRef<MetricsHistoryPoint[]>([])
    const lastCpuRef = useRef<number | null>(null)
    const lastMemRef = useRef<number | null>(null)
    const [cpuHistory, setCpuHistory] = useState<MetricsHistoryPoint[]>([])
    const [memHistory, setMemHistory] = useState<MetricsHistoryPoint[]>([])

    const updateHistory = useCallback(() => {
        if (!data) return
        const now = new Date().toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        })

        const cpuValue = data.cpu.usagePercent
        const memPercent =
            data.memory.total > 0
                ? Math.round((data.memory.used / data.memory.total) * 1000) / 10
                : 0

        if (
            cpuValue === lastCpuRef.current &&
            memPercent === lastMemRef.current
        )
            return

        lastCpuRef.current = cpuValue
        lastMemRef.current = memPercent

        cpuHistoryRef.current = [
            ...cpuHistoryRef.current,
            { time: now, value: cpuValue }
        ].slice(-HISTORY_SIZE)

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