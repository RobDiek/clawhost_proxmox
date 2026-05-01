import type { FC, ReactNode } from 'react'
import type { MonitorChartProps } from '@/ts/Interfaces'

import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    CartesianGrid
} from 'recharts'

const tooltipStyle = {
    backgroundColor: 'hsl(var(--background))',
    border: '1px solid hsl(var(--border))',
    borderRadius: '8px',
    fontSize: '12px'
}

const MonitorChart: FC<MonitorChartProps> = ({
    data = [],
    color,
    label
}): ReactNode => (
    <div className='mt-3'>
        <ResponsiveContainer width='100%' height={100}>
            <AreaChart data={data}>
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
                <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(v) => [`${v}%`, label]}
                />
                <Area
                    type='monotone'
                    dataKey='value'
                    stroke={color}
                    fill={color}
                    fillOpacity={0.1}
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                />
            </AreaChart>
        </ResponsiveContainer>
    </div>
)

export default MonitorChart