import type { IpcMainInvokeEvent } from 'electron'
import type { IPty } from 'node-pty'

import { ipcMain, BrowserWindow } from 'electron'
import * as pty from 'node-pty'
import { configStore } from '@/main/services'
import { t } from '@openclaw/i18n'

const terminals: Map<string, IPty> = new Map()

const registerAgentTerminalHandlers = (): void => {
    ipcMain.handle(
        'terminal:spawn',
        (
            _event: IpcMainInvokeEvent,
            id: string,
            cols: number,
            rows: number
        ) => {
            const agent = configStore.findAgent(id)
            if (!agent) throw new Error(t('go.clawNotFound'))

            if (terminals.has(id)) {
                terminals.get(id)!.kill()
                terminals.delete(id)
            }

            const agentDir = configStore.getAgentDir(agent.name)
            const shell = process.env.SHELL || '/bin/zsh'
            const home = process.env.HOME || agentDir
            const env = {
                ...process.env,
                HOME: home,
                TERM: 'xterm-256color',
                LANG: process.env.LANG || 'en_US.UTF-8',
                LC_ALL: process.env.LC_ALL || 'en_US.UTF-8'
            } as Record<string, string>
            delete (env as Record<string, string | undefined>).ELECTRON_RUN_AS_NODE
            delete (env as Record<string, string | undefined>).ELECTRON_NO_ATTACH_CONSOLE

            let term: IPty
            try {
                term = pty.spawn(shell, ['-l'], {
                    name: 'xterm-256color',
                    cols: cols || 80,
                    rows: rows || 24,
                    cwd: agentDir,
                    env
                })
            } catch (error) {
                console.error('agentTerminal', error)
                throw error
            }

            terminals.set(id, term)

            const sender = BrowserWindow.getAllWindows()[0]?.webContents
            if (sender) {
                term.onData((data) => {
                    sender.send('terminal:data', id, data)
                })

                term.onExit(({ exitCode, signal }) => {
                    console.error('agentTerminal pty exit', {
                        id,
                        exitCode,
                        signal,
                        shell
                    })
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

export default registerAgentTerminalHandlers