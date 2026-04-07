import type { FC, ReactNode } from 'react'
import type { ClawTerminalContentProps } from '@/ts/Interfaces'

import { useEffect, useRef, useCallback } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { t } from '@openclaw/i18n'
import { getCachedToken } from '@/lib/firebase'
import {
    CircleNotchIcon,
    TerminalWindowIcon,
    ArrowClockwiseIcon
} from '@phosphor-icons/react'
import { Button } from '@/components/ui'
import { ScrollToBottomButton } from '@/components/shared'
import { useTerminalStore } from '@/lib/store'
import { TERMINAL_STATUS } from '@/lib/constants'
import { Envs } from '@/lib'
import '@xterm/xterm/css/xterm.css'

let connectCounter = 0
const MAX_RECONNECT_ATTEMPTS = 5
const RECONNECT_DELAY = 2000

const ClawTerminalContent: FC<ClawTerminalContentProps> = ({
    clawId,
    enabled
}): ReactNode => {
    const containerRef = useRef<HTMLDivElement>(null)
    const terminalRef = useRef<Terminal | null>(null)
    const fitAddonRef = useRef<FitAddon | null>(null)
    const wsRef = useRef<WebSocket | null>(null)
    const observerRef = useRef<ResizeObserver | null>(null)
    const connectIdRef = useRef(0)
    const reconnectAttemptsRef = useRef(0)
    const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const { status, setStatus, showScrollButton, setShowScrollButton } =
        useTerminalStore()
    const connectRef = useRef<() => void>(() => {})

    const cleanupListenersRef = useRef<(() => void)[]>([])

    const cleanup = useCallback(() => {
        connectIdRef.current = ++connectCounter
        if (reconnectTimerRef.current) {
            clearTimeout(reconnectTimerRef.current)
            reconnectTimerRef.current = null
        }
        if (observerRef.current) {
            observerRef.current.disconnect()
            observerRef.current = null
        }
        if (wsRef.current) {
            wsRef.current.close()
            wsRef.current = null
        }
        cleanupListenersRef.current.forEach((fn) => fn())
        cleanupListenersRef.current = []
        const electronAPI = (
            window as {
                electronAPI?: {
                    invoke: (
                        channel: string,
                        ...args: unknown[]
                    ) => Promise<unknown>
                }
            }
        ).electronAPI
        if (electronAPI) {
            electronAPI.invoke('terminal:kill', clawId)
        }
        if (terminalRef.current) {
            terminalRef.current.dispose()
            terminalRef.current = null
        }
        fitAddonRef.current = null
    }, [clawId])

    const createTerminal = useCallback((container: HTMLElement) => {
        const styles = getComputedStyle(document.documentElement)
        const bgL = parseFloat(
            styles.getPropertyValue('--background').trim().split(/\s+/).pop() ||
                '0'
        )
        const mutedL = parseFloat(
            styles.getPropertyValue('--muted').trim().split(/\s+/).pop() || '0'
        )
        const termBg = `hsl(0 0% ${(bgL + mutedL) / 2}%)`
        const fg = `hsl(${styles.getPropertyValue('--foreground').trim()})`
        const mutedFg = `hsl(${styles.getPropertyValue('--muted-foreground').trim()})`

        const terminal = new Terminal({
            cursorBlink: true,
            fontSize: 13,
            fontFamily:
                'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
            theme: {
                background: termBg,
                foreground: fg,
                cursor: '#ef5350',
                selectionBackground: '#ef535040',
                black: termBg,
                red: '#ef5350',
                green: '#4ade80',
                yellow: '#facc15',
                blue: '#60a5fa',
                magenta: '#c084fc',
                cyan: '#22d3ee',
                white: fg,
                brightBlack: mutedFg,
                brightRed: '#f87171',
                brightGreen: '#86efac',
                brightYellow: '#fde047',
                brightBlue: '#93c5fd',
                brightMagenta: '#d8b4fe',
                brightCyan: '#67e8f9',
                brightWhite: '#fafafa'
            }
        })

        const fitAddon = new FitAddon()
        terminal.loadAddon(fitAddon)
        terminal.open(container)

        terminalRef.current = terminal
        fitAddonRef.current = fitAddon

        const cropTerminal = () => {
            const xtermEl = container.querySelector('.xterm') as HTMLElement
            const screenEl = container.querySelector(
                '.xterm-screen'
            ) as HTMLElement
            if (xtermEl && screenEl) {
                xtermEl.style.height = `${screenEl.offsetHeight}px`
            }
        }

        const fitAndCrop = () => {
            if (fitAddonRef.current) {
                fitAddonRef.current.fit()
                cropTerminal()
            }
        }

        requestAnimationFrame(fitAndCrop)

        let resizeTimer: ReturnType<typeof setTimeout>
        const observer = new ResizeObserver(() => {
            clearTimeout(resizeTimer)
            resizeTimer = setTimeout(fitAndCrop, 50)
        })
        observer.observe(container)
        observerRef.current = observer

        terminal.onScroll(() => {
            const buf = terminal.buffer.active
            setShowScrollButton(buf.viewportY < buf.baseY)
        })

        return { terminal, fitAndCrop }
    }, [])

    const connectDesktop = useCallback(
        async (myId: number, container: HTMLElement) => {
            const electronAPI = (
                window as {
                    electronAPI?: {
                        invoke: (
                            channel: string,
                            ...args: unknown[]
                        ) => Promise<unknown>
                        onTerminalData: (
                            cb: (id: string, data: string) => void
                        ) => () => void
                        onTerminalExit: (cb: (id: string) => void) => () => void
                    }
                }
            ).electronAPI
            if (!electronAPI) {
                setStatus(TERMINAL_STATUS.ERROR)
                return
            }

            const { terminal, fitAndCrop } = createTerminal(container)

            try {
                await electronAPI.invoke(
                    'terminal:spawn',
                    clawId,
                    terminal.cols,
                    terminal.rows
                )
            } catch (error) {
                console.error('connectDesktop', error)
                setStatus(TERMINAL_STATUS.ERROR)
                return
            }

            if (connectIdRef.current !== myId) return

            const removeDataListener = electronAPI.onTerminalData(
                (id, data) => {
                    if (id === clawId) {
                        terminal.write(data)
                    }
                }
            )
            cleanupListenersRef.current.push(removeDataListener)

            const removeExitListener = electronAPI.onTerminalExit((id) => {
                if (id === clawId && connectIdRef.current === myId) {
                    setStatus(TERMINAL_STATUS.DISCONNECTED)
                }
            })
            cleanupListenersRef.current.push(removeExitListener)

            setStatus(TERMINAL_STATUS.CONNECTED)
            requestAnimationFrame(() => {
                fitAndCrop()
                terminal.focus()
            })

            terminal.onData((data) => {
                electronAPI.invoke('terminal:write', clawId, data)
            })

            terminal.onResize(({ cols, rows }) => {
                electronAPI.invoke('terminal:resize', clawId, cols, rows)
            })
        },
        [clawId, createTerminal]
    )

    const connectCloud = useCallback(
        async (myId: number, container: HTMLElement) => {
            const token = await getCachedToken()

            if (connectIdRef.current !== myId) return

            if (!token) {
                setStatus(TERMINAL_STATUS.ERROR)
                return
            }

            const { terminal, fitAndCrop } = createTerminal(container)

            const apiUrl = Envs.VITE_API_URL
            const wsUrl = apiUrl.startsWith('http')
                ? `${apiUrl.replace(/^http/, 'ws')}/claws/${clawId}/terminal?token=${encodeURIComponent(token)}`
                : `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws/claws/${clawId}/terminal?token=${encodeURIComponent(token)}`
            const ws = new WebSocket(wsUrl)
            wsRef.current = ws

            let connected = false

            ws.onopen = () => {
                ws.send(
                    JSON.stringify({
                        type: 'resize',
                        cols: terminal.cols,
                        rows: terminal.rows
                    })
                )
                requestAnimationFrame(fitAndCrop)
            }

            ws.onmessage = (event) => {
                if (!connected) {
                    connected = true
                    reconnectAttemptsRef.current = 0
                    setStatus(TERMINAL_STATUS.CONNECTED)
                    requestAnimationFrame(() => {
                        terminal.focus()
                    })
                }
                terminal.write(event.data)
            }

            ws.onclose = () => {
                if (connectIdRef.current !== myId) return
                if (
                    connected &&
                    reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS
                ) {
                    reconnectAttemptsRef.current++
                    setStatus(TERMINAL_STATUS.CONNECTING)
                    reconnectTimerRef.current = setTimeout(() => {
                        if (connectIdRef.current === myId) {
                            connectRef.current()
                        }
                    }, RECONNECT_DELAY)
                } else {
                    setStatus((prev) =>
                        prev === TERMINAL_STATUS.ERROR
                            ? TERMINAL_STATUS.ERROR
                            : TERMINAL_STATUS.DISCONNECTED
                    )
                }
            }

            ws.onerror = () => {
                setStatus(TERMINAL_STATUS.ERROR)
            }

            terminal.onData((data) => {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(data)
                }
            })

            terminal.onResize(({ cols, rows }) => {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ type: 'resize', cols, rows }))
                }
            })
        },
        [clawId, createTerminal]
    )

    const connect = useCallback(async () => {
        cleanup()
        reconnectAttemptsRef.current = 0
        if (!containerRef.current) return

        const myId = connectIdRef.current
        setStatus(TERMINAL_STATUS.CONNECTING)

        const container = containerRef.current
        if (!container) {
            setStatus(TERMINAL_STATUS.ERROR)
            return
        }

        const electronAPI = (
            window as { electronAPI?: { isDesktop?: boolean } }
        ).electronAPI
        if (electronAPI?.isDesktop) {
            await connectDesktop(myId, container)
        } else {
            await connectCloud(myId, container)
        }
    }, [cleanup, connectDesktop, connectCloud])

    connectRef.current = connect

    useEffect(() => {
        if (enabled) {
            connect()
        } else {
            cleanup()
            setStatus(TERMINAL_STATUS.IDLE)
            setShowScrollButton(false)
        }

        return cleanup
    }, [enabled, connect, cleanup])

    const handleTerminalScrollToBottom = useCallback(() => {
        terminalRef.current?.scrollToBottom()
        setShowScrollButton(false)
    }, [])

    const showOverlay =
        status === TERMINAL_STATUS.CONNECTING ||
        status === TERMINAL_STATUS.ERROR ||
        status === TERMINAL_STATUS.DISCONNECTED

    return (
        <div
            className='bg-muted/50 relative h-full w-full overflow-hidden'
            onKeyDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => {
                if (terminalRef.current && e.target === e.currentTarget) {
                    e.preventDefault()
                    terminalRef.current.focus()
                }
            }}
        >
            <div
                ref={containerRef}
                className={`absolute bottom-2 left-2 right-0 top-2 overflow-hidden ${showOverlay ? 'opacity-0' : ''}`}
            />
            {showOverlay && (
                <div className='bg-muted/50 absolute inset-0 flex items-center justify-center'>
                    {status === TERMINAL_STATUS.CONNECTING && (
                        <div className='flex flex-col items-center gap-3'>
                            <CircleNotchIcon className='text-muted-foreground h-6 w-6 animate-spin' />
                            <span className='text-muted-foreground text-xs'>
                                {t('playground.terminalConnecting')}
                            </span>
                        </div>
                    )}
                    {(status === TERMINAL_STATUS.ERROR ||
                        status === TERMINAL_STATUS.DISCONNECTED) && (
                        <div className='flex flex-col items-center gap-3'>
                            <div className='bg-foreground/5 flex h-12 w-12 items-center justify-center rounded-xl'>
                                <TerminalWindowIcon
                                    className='text-muted-foreground h-6 w-6'
                                    weight='duotone'
                                />
                            </div>
                            <p className='text-foreground/80 text-sm font-medium'>
                                {t(
                                    status === TERMINAL_STATUS.ERROR
                                        ? 'playground.terminalError'
                                        : 'playground.terminalDisconnected'
                                )}
                            </p>
                            <Button
                                size='sm'
                                variant='outline'
                                onClick={connect}
                            >
                                <ArrowClockwiseIcon className='mr-2 h-3.5 w-3.5' />
                                {t('playground.terminalReconnect')}
                            </Button>
                        </div>
                    )}
                </div>
            )}
            <ScrollToBottomButton
                visible={showScrollButton && !showOverlay}
                onClick={handleTerminalScrollToBottom}
            />
        </div>
    )
}

export default ClawTerminalContent