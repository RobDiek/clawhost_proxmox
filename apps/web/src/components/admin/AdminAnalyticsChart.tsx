import type { FC, ReactNode } from 'react'
import type {
    AdminAnalyticsChartProps,
    AdminAnalyticsDataPoint,
    RangeBucketConfig
} from '@/ts/Interfaces'

import { useMemo } from 'react'
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    CartesianGrid
} from 'recharts'
import { getLocale } from '@/lib'

const RANGE_BUCKETS: Record<string, RangeBucketConfig> = {
    day: { count: 24, stepMs: 3600000, offsetMs: 86400000 },
    week: { count: 7, stepMs: 86400000, offsetMs: 604800000 },
    month: { count: 30, stepMs: 86400000, offsetMs: 2592000000 },
    year: { count: 12, stepMs: 2592000000, offsetMs: 31536000000 },
    all: { count: 12, stepMs: 2592000000, offsetMs: 31536000000 }
}

const fillBuckets = (
    data: AdminAnalyticsDataPoint[],
    range: string
): AdminAnalyticsDataPoint[] => {
    const config = RANGE_BUCKETS[range]
    if (!config) return data

    const now = Date.now()
    const start = now - config.offsetMs
    const dataMap = new Map<string, number>()

    for (const point of data) {
        const key = new Date(point.date).toISOString()
        dataMap.set(key, (dataMap.get(key) || 0) + point.count)
    }

    const buckets: AdminAnalyticsDataPoint[] = []
    for (let i = 0; i < config.count; i++) {
        const bucketTime = start + i * config.stepMs
        const bucketDate = new Date(bucketTime)
        bucketDate.setMinutes(0, 0, 0)
        const isoKey = bucketDate.toISOString()

        let count = 0
        for (const [key, val] of dataMap.entries()) {
            const pointTime = new Date(key).getTime()
            const bucketEnd = bucketTime + config.stepMs
            if (pointTime >= bucketTime && pointTime < bucketEnd) {
                count += val
            }
        }

        buckets.push({ date: isoKey, count })
    }

    return buckets
}

const formatXAxis = (dateStr: string, range: string): string => {
    const date = new Date(dateStr)
    const locale = getLocale()
    if (range === 'day')
        return date.toLocaleTimeString(locale, {
            hour: '2-digit',
            minute: '2-digit'
        })
    if (range === 'year' || range === 'all')
        return date.toLocaleDateString(locale, {
            month: 'short',
            year: '2-digit'
        })
    return date.toLocaleDateString(locale, { month: 'short', day: 'numeric' })
}

const formatTooltipDate = (dateStr: string, range: string): string => {
    const date = new Date(dateStr)
    const locale = getLocale()
    if (range === 'day') {
        return date.toLocaleString(locale, {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        })
    }
    if (range === 'year' || range === 'all')
        return date.toLocaleDateString(locale, {
            month: 'long',
            year: 'numeric'
        })
    return date.toLocaleDateString(locale, {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    })
}

const AdminAnalyticsChart: FC<AdminAnalyticsChartProps> = ({
    title,
    data,
    color,
    range
}): ReactNode => {
    const chartData = useMemo(() => fillBuckets(data, range), [data, range])
    const total = data.reduce((sum, d) => sum + d.count, 0)

    return (
        <div
            className='border-border rounded-lg border p-4 outline-none'
            tabIndex={-1}
        >
            <div className='mb-3 flex items-center justify-between'>
                <h4 className='text-sm font-medium'>{title}</h4>
                <span className='text-muted-foreground text-xs'>{total}</span>
            </div>
            <ResponsiveContainer width='100%' height={200}>
                <LineChart data={chartData}>
                    <CartesianGrid
                        strokeDasharray='3 3'
                        stroke='hsl(var(--border))'
                    />
                    <XAxis
                        dataKey='date'
                        tickFormatter={(val) => formatXAxis(val, range)}
                        tick={{
                            fontSize: 10,
                            fill: 'hsl(var(--muted-foreground))'
                        }}
                        axisLine={false}
                        tickLine={false}
                        interval='preserveStartEnd'
                    />
                    <YAxis
                        allowDecimals={false}
                        tick={{
                            fontSize: 10,
                            fill: 'hsl(var(--muted-foreground))'
                        }}
                        axisLine={false}
                        tickLine={false}
                        width={30}
                    />
                    <Tooltip
                        contentStyle={{
                            backgroundColor: 'hsl(var(--background))',
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '8px',
                            fontSize: '12px'
                        }}
                        labelFormatter={(val) =>
                            formatTooltipDate(val as string, range)
                        }
                    />
                    <Line
                        type='monotone'
                        dataKey='count'
                        stroke={color}
                        strokeWidth={2}
                        dot={false}
                    />
                </LineChart>
            </ResponsiveContainer>
        </div>
    )
}

export default AdminAnalyticsChart