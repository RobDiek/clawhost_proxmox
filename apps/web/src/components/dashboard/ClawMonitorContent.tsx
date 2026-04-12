import type { FC, ReactNode } from 'react'
import type { ClawMonitorContentProps } from '@/ts/Interfaces'

import { useState, useRef, useEffect, useCallback } from 'react'
import { t } from '@openclaw/i18n'
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    CartesianGrid,
    BarChart,
    Bar
} from 'recharts'
import {
    ChartLineUpIcon,
    CpuIcon,
    HardDriveIcon,
    ClockIcon,
    WifiHighIcon,
    GaugeIcon,
    CheckCircleIcon,
    WarningIcon,
    WrenchIcon,
    CircleNotchIcon
} from '@phosphor-icons/react'
import { Button, Skeleton } from '@/components/ui'
import { PanelPlaceholder, LiveBadge } from '@/components/shared'
import { useClawMetrics, useClawDiagnostics, useRepairClaw } from '@/hooks'
import { useUIStore } from '@/lib/store'
import { TOAST_TYPE } from '@/lib/constants'

const HISTORY_SIZE = 60

const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B'
    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    const value = bytes / Math.pow(1024, i)
    return `${value.toFixed(value < 10 ? 1 : 0)} ${units[i]}`
}

const UsageBar: FC<{
    value: number
    color: string
    label: string
    detail: string
}> = ({ value, color, label, detail }): ReactNode => (
    <div className='space-y-1.5'>
        <div className='flex items-center justify-between text-xs'>
            <span className='text-foreground font-medium'>{label}</span>
            <span className='text-muted-foreground'>{detail}</span>
        </div>
        <div className='bg-muted h-2.5 w-full overflow-hidden rounded-full'>
            <div
                className='h-full rounded-full transition-all duration-500'
                style={{
                    width: `${Math.min(value, 100)}%`,
                    backgroundColor: color
                }}
            />
        </div>
    </div>
)

const MetricCard: FC<{
    title: string
    icon: ReactNode
    children: ReactNode
}> = ({ title, icon, children }): ReactNode => (
    <div className='border-border rounded-lg border p-4'>
        <div className='mb-3 flex items-center gap-2'>
            {icon}
            <h4 className='text-sm font-medium'>{title}</h4>
        </div>
        {children}
    </div>
)

const ClawMonitorContent: FC<ClawMonitorContentProps> = ({
    clawId
}): ReactNode => {
    const { data, isPending, isError } = useClawMetrics(clawId, true)
    const diagnostics = useClawDiagnostics(clawId, true)
    const repair = useRepairClaw()
    const showToast = useUIStore((s) => s.showToast)

    const handleRepair = () => {
        repair.mutate(clawId, {
            onSuccess: () => {
                showToast(
                    t('dashboard.diagnosticsRepairSuccess'),
                    TOAST_TYPE.SUCCESS
                )
            },
            onError: (err) => {
                showToast(
                    err.message || t('api.failedToRepairClaw'),
                    TOAST_TYPE.ERROR
                )
            }
        })
    }

    const hasIssue =
        diagnostics.data &&
        (!diagnostics.data.service.includes('active (running)') ||
            diagnostics.data.port.includes('not listening'))
    const cpuHistoryRef = useRef<{ time: string; value: number }[]>([])
    const memHistoryRef = useRef<{ time: string; value: number }[]>([])
    const [cpuHistory, setCpuHistory] = useState<{ time: string; value: number }[]>([])
    const [memHistory, setMemHistory] = useState<{ time: string; value: number }[]>([])

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

        const memPercent = data.memory.total > 0
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

    if (isError) {
        return (
            <div className='flex h-full items-center justify-center p-5'>
                <PanelPlaceholder
                    icon={
                        <ChartLineUpIcon
                            className='text-muted-foreground h-6 w-6'
                            weight='duotone'
                        />
                    }
                    title={t('clawDetail.metricsError')}
                    description={t('clawDetail.metricsErrorDescription')}
                />
            </div>
        )
    }

    if (isPending && !data) {
        return (
            <div className='space-y-4 p-5'>
                <Skeleton className='h-8 w-48 rounded-md' />
                <div className='grid grid-cols-1 gap-4'>
                    <Skeleton className='h-[180px] w-full rounded-lg' />
                    <Skeleton className='h-[180px] w-full rounded-lg' />
                    <Skeleton className='h-[120px] w-full rounded-lg' />
                    <Skeleton className='h-[200px] w-full rounded-lg' />
                </div>
            </div>
        )
    }

    if (!data) return null

    const memPercent = data.memory.total > 0
        ? Math.round((data.memory.used / data.memory.total) * 1000) / 10
        : 0

    const cpuColor = data.cpu.usagePercent > 80 ? '#ef4444' : data.cpu.usagePercent > 50 ? '#f59e0b' : '#22c55e'
    const memColor = memPercent > 80 ? '#ef4444' : memPercent > 50 ? '#f59e0b' : '#3b82f6'
    const diskColor = data.disk.usagePercent > 80 ? '#ef4444' : data.disk.usagePercent > 50 ? '#f59e0b' : '#8b5cf6'

    const tooltipStyle = {
        backgroundColor: 'hsl(var(--background))',
        border: '1px solid hsl(var(--border))',
        borderRadius: '8px',
        fontSize: '12px'
    }

    return (
        <div className='h-full space-y-4 overflow-y-auto p-5'>
            <div className='flex items-center justify-between'>
                <div className='flex items-center gap-2'>
                    <h3 className='text-sm font-medium'>
                        {t('clawDetail.metricsTitle')}
                    </h3>
                    <LiveBadge />
                </div>
                {data.uptime && (
                    <div className='text-muted-foreground flex items-center gap-1.5 text-xs'>
                        <ClockIcon className='h-3.5 w-3.5' />
                        {t('clawDetail.metricsUptime')}: {data.uptime}
                    </div>
                )}
            </div>

            {diagnostics.data && hasIssue && (
                <div className='flex items-center justify-between rounded-md bg-yellow-500/10 p-3 text-sm text-yellow-700 dark:text-yellow-400'>
                    <div className='flex items-center gap-2'>
                        <WarningIcon className='h-4 w-4 shrink-0' />
                        {t('dashboard.diagnosticsIssueDetected')}
                    </div>
                    <Button
                        size='sm'
                        variant='outline'
                        className='shrink-0 border-yellow-500/30 text-yellow-700 hover:bg-yellow-500/20 hover:text-yellow-800 dark:text-yellow-400 dark:hover:bg-yellow-500/20 dark:hover:text-yellow-300'
                        onClick={handleRepair}
                        disabled={repair.isPending}
                    >
                        {repair.isPending ? (
                            <CircleNotchIcon className='mr-1 h-3.5 w-3.5 animate-spin' />
                        ) : (
                            <WrenchIcon className='mr-1 h-3.5 w-3.5' />
                        )}
                        {t('dashboard.diagnosticsRepair')}
                    </Button>
                </div>
            )}
            {diagnostics.data && !hasIssue && (
                <div className='flex items-center gap-2 rounded-md bg-green-500/10 p-3 text-sm text-green-700 dark:text-green-400'>
                    <CheckCircleIcon className='h-4 w-4 shrink-0' />
                    {t('dashboard.diagnosticsHealthy')}
                </div>
            )}

            <MetricCard
                title={t('clawDetail.metricsCpu')}
                icon={<CpuIcon className='h-4 w-4' style={{ color: cpuColor }} />}
            >
                <UsageBar
                    value={data.cpu.usagePercent}
                    color={cpuColor}
                    label={`${data.cpu.usagePercent}%`}
                    detail={`${data.cpu.cores} ${data.cpu.cores === 1 ? 'core' : 'cores'}`}
                />
                {cpuHistory.length > 1 && (
                    <div className='mt-3'>
                        <ResponsiveContainer width='100%' height={100}>
                            <AreaChart data={cpuHistory}>
                                <CartesianGrid
                                    strokeDasharray='3 3'
                                    stroke='hsl(var(--border))'
                                />
                                <XAxis
                                    dataKey='time'
                                    tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
                                    axisLine={false}
                                    tickLine={false}
                                    interval='preserveStartEnd'
                                />
                                <YAxis
                                    domain={[0, 100]}
                                    tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
                                    axisLine={false}
                                    tickLine={false}
                                    width={30}
                                    tickFormatter={(v) => `${v}%`}
                                />
                                <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`${v}%`, 'CPU']} />
                                <Area
                                    type='monotone'
                                    dataKey='value'
                                    stroke={cpuColor}
                                    fill={cpuColor}
                                    fillOpacity={0.1}
                                    strokeWidth={2}
                                    dot={false}
                                    isAnimationActive={false}
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                )}
            </MetricCard>

            <MetricCard
                title={t('clawDetail.metricsMemory')}
                icon={<GaugeIcon className='h-4 w-4' style={{ color: memColor }} />}
            >
                <UsageBar
                    value={memPercent}
                    color={memColor}
                    label={`${memPercent}%`}
                    detail={`${formatBytes(data.memory.used)} / ${formatBytes(data.memory.total)}`}
                />
                {memHistory.length > 1 && (
                    <div className='mt-3'>
                        <ResponsiveContainer width='100%' height={100}>
                            <AreaChart data={memHistory}>
                                <CartesianGrid
                                    strokeDasharray='3 3'
                                    stroke='hsl(var(--border))'
                                />
                                <XAxis
                                    dataKey='time'
                                    tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
                                    axisLine={false}
                                    tickLine={false}
                                    interval='preserveStartEnd'
                                />
                                <YAxis
                                    domain={[0, 100]}
                                    tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
                                    axisLine={false}
                                    tickLine={false}
                                    width={30}
                                    tickFormatter={(v) => `${v}%`}
                                />
                                <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`${v}%`, 'MEM']} />
                                <Area
                                    type='monotone'
                                    dataKey='value'
                                    stroke={memColor}
                                    fill={memColor}
                                    fillOpacity={0.1}
                                    strokeWidth={2}
                                    dot={false}
                                    isAnimationActive={false}
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                )}
            </MetricCard>

            <MetricCard
                title={t('clawDetail.metricsDisk')}
                icon={<HardDriveIcon className='h-4 w-4' style={{ color: diskColor }} />}
            >
                <UsageBar
                    value={data.disk.usagePercent}
                    color={diskColor}
                    label={`${data.disk.usagePercent}%`}
                    detail={`${formatBytes(data.disk.used)} / ${formatBytes(data.disk.total)}`}
                />
            </MetricCard>

            <MetricCard
                title={t('clawDetail.metricsNetwork')}
                icon={<WifiHighIcon className='h-4 w-4 text-cyan-500' />}
            >
                <div className='grid grid-cols-2 gap-4'>
                    <div className='space-y-1'>
                        <span className='text-muted-foreground text-xs'>
                            {t('clawDetail.metricsReceived')}
                        </span>
                        <p className='text-foreground text-sm font-medium'>
                            {formatBytes(data.network.rxBytes)}
                        </p>
                    </div>
                    <div className='space-y-1'>
                        <span className='text-muted-foreground text-xs'>
                            {t('clawDetail.metricsSent')}
                        </span>
                        <p className='text-foreground text-sm font-medium'>
                            {formatBytes(data.network.txBytes)}
                        </p>
                    </div>
                </div>
            </MetricCard>

            <MetricCard
                title={t('clawDetail.metricsLoadAvg')}
                icon={<GaugeIcon className='h-4 w-4 text-amber-500' />}
            >
                <ResponsiveContainer width='100%' height={80}>
                    <BarChart
                        data={[
                            {
                                name: t('clawDetail.metricsLoad1'),
                                value: data.loadAvg.load1
                            },
                            {
                                name: t('clawDetail.metricsLoad5'),
                                value: data.loadAvg.load5
                            },
                            {
                                name: t('clawDetail.metricsLoad15'),
                                value: data.loadAvg.load15
                            }
                        ]}
                    >
                        <CartesianGrid
                            strokeDasharray='3 3'
                            stroke='hsl(var(--border))'
                        />
                        <XAxis
                            dataKey='name'
                            tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                            axisLine={false}
                            tickLine={false}
                        />
                        <YAxis
                            tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                            axisLine={false}
                            tickLine={false}
                            width={30}
                        />
                        <Tooltip contentStyle={tooltipStyle} />
                        <Bar
                            dataKey='value'
                            fill='#f59e0b'
                            radius={[4, 4, 0, 0]}
                        />
                    </BarChart>
                </ResponsiveContainer>
            </MetricCard>

            <MetricCard
                title={t('clawDetail.metricsProcesses')}
                icon={<CpuIcon className='h-4 w-4 text-emerald-500' />}
            >
                <div className='overflow-x-auto'>
                    <table className='w-full text-xs'>
                        <thead>
                            <tr className='text-muted-foreground border-border border-b'>
                                <th className='pb-2 pr-3 text-left font-medium'>
                                    {t('clawDetail.metricsProcessPid')}
                                </th>
                                <th className='pb-2 pr-3 text-left font-medium'>
                                    {t('clawDetail.metricsProcessUser')}
                                </th>
                                <th className='pb-2 pr-3 text-right font-medium'>
                                    {t('clawDetail.metricsProcessCpu')}
                                </th>
                                <th className='pb-2 pr-3 text-right font-medium'>
                                    {t('clawDetail.metricsProcessMem')}
                                </th>
                                <th className='pb-2 text-left font-medium'>
                                    {t('clawDetail.metricsProcessCommand')}
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.processes.map((proc) => (
                                <tr
                                    key={proc.pid}
                                    className='border-border border-b last:border-0'
                                >
                                    <td className='text-muted-foreground py-1.5 pr-3'>
                                        {proc.pid}
                                    </td>
                                    <td className='py-1.5 pr-3'>
                                        {proc.user}
                                    </td>
                                    <td className='py-1.5 pr-3 text-right'>
                                        {proc.cpu.toFixed(1)}
                                    </td>
                                    <td className='py-1.5 pr-3 text-right'>
                                        {proc.mem.toFixed(1)}
                                    </td>
                                    <td className='max-w-[200px] truncate py-1.5 font-mono'>
                                        {proc.command}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </MetricCard>
        </div>
    )
}

export default ClawMonitorContent