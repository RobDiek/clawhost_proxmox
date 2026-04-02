import type { FC, ReactNode } from 'react'
import type { ClawLogsContentProps, ParsedLogLine } from '@/ts/Interfaces'

import { useEffect, useMemo, useRef } from 'react'
import { t } from '@openclaw/i18n'
import { getLocale } from '@/lib'
import { Skeleton } from '@/components/ui'
import { ScrollIcon } from '@phosphor-icons/react'
import { useClawLogs, useScrollToBottom } from '@/hooks'
import { PanelPlaceholder, ScrollToBottomButton } from '@/components/shared'

const ClawLogsContent: FC<ClawLogsContentProps> = ({
    clawId,
    enabled,
    embedded,
    mockLogs
}): ReactNode => {
    const query = useClawLogs(clawId, enabled && !mockLogs)
    const logs = mockLogs
        ? { data: { logs: mockLogs }, isPending: false, isError: false }
        : query
    const {
        scrollRef,
        showButton,
        handleScroll,
        scrollToBottom,
        isAtBottomRef
    } = useScrollToBottom({ threshold: 50 })
    const isFirstLoadRef = useRef(true)
    const timestampRegex =
        /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?)\s*/

    const parsedLines = useMemo((): ParsedLogLine[] => {
        if (!embedded || !logs.data?.logs) return []
        return logs.data.logs
            .split('\n')
            .filter((line) => line.trim())
            .map((line): ParsedLogLine => {
                const match = line.match(timestampRegex)
                if (match) {
                    const raw = match[1]
                    const date = new Date(raw)
                    const time = date.toLocaleTimeString(getLocale(), {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                        hour12: false
                    })
                    return { time, text: line.slice(match[0].length) }
                }
                return { time: null, text: line }
            })
    }, [embedded, logs.data])

    useEffect(() => {
        if (logs.data) {
            if (isFirstLoadRef.current) {
                setTimeout(() => scrollToBottom('instant'), 0)
                isFirstLoadRef.current = false
            } else if (isAtBottomRef.current) {
                setTimeout(() => scrollToBottom('instant'), 0)
            }
        }
    }, [logs.data])

    useEffect(() => {
        if (!enabled) {
            isFirstLoadRef.current = true
            isAtBottomRef.current = true
        }
    }, [enabled])

    return (
        <div
            className={`relative ${embedded ? 'flex min-h-0 flex-1 flex-col' : 'h-full'}`}
        >
            <div
                ref={scrollRef}
                onScroll={handleScroll}
                className={`overflow-y-auto ${embedded ? 'min-h-0 flex-1' : 'h-full'}`}
            >
                {logs.isPending && embedded && (
                    <div className='bg-foreground/5 h-full w-full animate-pulse' />
                )}
                {logs.isPending && !embedded && (
                    <Skeleton className='border-border h-full w-full rounded-md border' />
                )}
                {logs.isError && (
                    <PanelPlaceholder
                        icon={
                            <ScrollIcon
                                className='text-muted-foreground h-6 w-6'
                                weight='duotone'
                            />
                        }
                        title={t('api.failedToGetLogs')}
                        description={t('api.failedToGetLogsDescription')}
                    />
                )}
                {logs.data && !embedded && (
                    <pre className='border-border bg-muted text-muted-foreground overflow-auto whitespace-pre-wrap break-words rounded-md border p-3 text-xs leading-snug'>
                        {logs.data.logs || t('dashboard.diagnosticsNoLogs')}
                    </pre>
                )}
                {logs.data && embedded && (
                    <div
                        className={`bg-muted/50 flex flex-col gap-1 p-4 ${parsedLines.length === 0 ? 'h-full items-center justify-center' : ''}`}
                    >
                        {parsedLines.length === 0 && (
                            <PanelPlaceholder
                                icon={
                                    <ScrollIcon
                                        className='text-muted-foreground h-6 w-6'
                                        weight='duotone'
                                    />
                                }
                                title={t('dashboard.diagnosticsNoLogs')}
                                description=''
                            />
                        )}
                        {parsedLines.map((line, i) => (
                            <div key={i} className='flex gap-2'>
                                {line.time && (
                                    <span className='text-muted-foreground/60 shrink-0 font-mono text-[10px] leading-4'>
                                        {line.time}
                                    </span>
                                )}
                                <span className='text-foreground/80 min-w-0 whitespace-pre-wrap break-words font-mono text-xs'>
                                    {line.text}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
            <ScrollToBottomButton
                visible={showButton}
                onClick={() => scrollToBottom('smooth')}
            />
        </div>
    )
}

export default ClawLogsContent