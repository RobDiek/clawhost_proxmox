import type { IpcMainInvokeEvent } from 'electron'
import type { IPty } from 'node-pty'

import { ipcMain, BrowserWindow } from 'electron'
import * as pty from 'node-pty'
import { configStore } from '@/main/services'
import { t } from '@openclaw/i18n'

const terminals: Map<string, IPty> = new Map()

const registerClawTerminalHandlers = (): void => {
    ipcMain.handle(
        'terminal:spawn',
        (
            _event: IpcMainInvokeEvent,
            id: string,
            cols: number,
            rows: number
        ) => {
            const claw = configStore.findClaw(id)
            if (!claw) throw new Error(t('go.clawNotFound'))

            if (terminals.has(id)) {
                terminals.get(id)!.kill()
                terminals.delete(id)
            }

            const clawDir = configStore.getClawDir(claw.name)
            const shell = process.env.SHELL || '/bin/zsh'

            let term: IPty
            try {
                term = pty.spawn(shell, [], {
                    name: 'xterm-256color',
                    cols: cols || 80,
                    rows: rows || 24,
                    cwd: clawDir,
                    env: {
                        ...process.env,
                        TERM: 'xterm-256color'
                    } as Record<string, string>
                })
            } catch (error) {
                console.error('clawTerminal', error)
                throw error
            }

            terminals.set(id, term)

            const sender = BrowserWindow.getAllWindows()[0]?.webContents
            if (sender) {
                term.onData((data) => {
                    sender.send('terminal:data', id, data)
                })

                term.onExit(() => {
                    terminals.delete(id)
                    sender.send('terminal:exit', id)
                })
            }

            return { pid: term.pid }
        }
    )

    ipcMain.handle(
        'terminal:write',
        (_event: IpcMainInvokeEvent, id: string, data: string) => {
            const term = terminals.get(id)
            if (term) {
                term.write(data)
            }
        }
    )

    ipcMain.handle(
        'terminal:resize',
        (
            _event: IpcMainInvokeEvent,
            id: string,
            cols: number,
            rows: number
        ) => {
            const term = terminals.get(id)
            if (term) {
                term.resize(cols, rows)
            }
        }
    )

    ipcMain.handle(
        'terminal:kill',
        (_event: IpcMainInvokeEvent, id: string) => {
            const term = terminals.get(id)
            if (term) {
                term.kill()
                terminals.delete(id)
            }
        }
    )
}

export default registerClawTerminalHandlers