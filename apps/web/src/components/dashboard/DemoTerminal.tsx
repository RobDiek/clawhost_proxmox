import type { FC, ReactNode } from 'react'

import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { demoTerminalOutput } from '@/data'
import '@xterm/xterm/css/xterm.css'

const DemoTerminal: FC = (): ReactNode => {
    const containerRef = useRef<HTMLDivElement>(null)
    const termRef = useRef<Terminal | null>(null)

    useEffect(() => {
        if (!containerRef.current || termRef.current) return
        const styles = getComputedStyle(document.documentElement)
        const bgL = parseFloat(
            styles.getPropertyValue('--background').trim().split(/\s+/).pop() || '0'
        )
        const mutedL = parseFloat(
            styles.getPropertyValue('--muted').trim().split(/\s+/).pop() || '0'
        )
        const termBg = `hsl(0 0% ${(bgL + mutedL) / 2}%)`
        const fg = `hsl(${styles.getPropertyValue('--foreground').trim()})`
        const mutedFg = `hsl(${styles.getPropertyValue('--muted-foreground').trim()})`
        const term = new Terminal({
            cursorBlink: true,
            fontSize: 13,
            fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
            disableStdin: true,
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
        term.loadAddon(fitAddon)
        term.open(containerRef.current)
        requestAnimationFrame(() => fitAddon.fit())
        term.write(demoTerminalOutput)
        termRef.current = term
        return () => {
            term.dispose()
            termRef.current = null
        }
    }, [])

    return (
        <div className='bg-muted/50 relative h-full w-full overflow-hidden'>
            <div
                ref={containerRef}
                className='absolute bottom-2 left-2 right-0 top-2 overflow-hidden'
            />
        </div>
    )
}

export default DemoTerminal