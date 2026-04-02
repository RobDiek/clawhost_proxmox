import type { IpcMainInvokeEvent } from 'electron'
import type { ReadClawFileData } from '@/ts/Interfaces'

import { ipcMain } from 'electron'
import fs from 'fs'
import path from 'path'
import { configStore } from '@/main/services'
import { t } from '@openclaw/i18n'

const isPathSafe = (clawDir: string, filePath: string): boolean => {
    const resolved = path.resolve(clawDir, filePath)
    return resolved.startsWith(clawDir)
}

const getFileType = (name: string): string => {
    const ext = path.extname(name).toLowerCase()
    const typeMap: Record<string, string> = {
        '.json': 'json',
        '.yaml': 'yaml',
        '.yml': 'yaml',
        '.md': 'markdown',
        '.js': 'javascript',
        '.ts': 'typescript',
        '.txt': 'text',
        '.env': 'env',
        '.log': 'log',
        '.sh': 'shell',
        '.py': 'python',
        '.toml': 'toml',
        '.cfg': 'config',
        '.conf': 'config',
        '.ini': 'config'
    }
    return typeMap[ext] || 'text'
}

const scanFilesRecursive = (
    dir: string,
    baseDir: string
): Array<{ name: string; path: string; fileType: string }> => {
    const results: Array<{ name: string; path: string; fileType: string }> = []
    if (!fs.existsSync(dir)) return results

    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
        if (entry.name.startsWith('.') && entry.name !== '.env') continue
        const fullPath = path.join(dir, entry.name)
        if (entry.isDirectory()) {
            results.push(...scanFilesRecursive(fullPath, baseDir))
        } else {
            results.push({
                name: entry.name,
                path: path.relative(baseDir, fullPath),
                fileType: getFileType(entry.name)
            })
        }
    }
    return results
}

const registerClawFileHandlers = (): void => {
    ipcMain.handle(
        'listClawFiles',
        (_event: IpcMainInvokeEvent, id: string) => {
            const claw = configStore.findClaw(id)
            if (!claw) throw new Error(t('go.clawNotFound'))

            const clawDir = configStore.getClawDir(claw.name)
            if (!fs.existsSync(clawDir)) {
                return { files: [] }
            }

            const files = scanFilesRecursive(clawDir, clawDir)
            files.sort((a, b) => a.path.localeCompare(b.path))

            return { files }
        }
    )

    ipcMain.handle(
        'readClawFile',
        (_event: IpcMainInvokeEvent, id: string, data: ReadClawFileData) => {
            const claw = configStore.findClaw(id)
            if (!claw) throw new Error(t('go.clawNotFound'))

            const clawDir = configStore.getClawDir(claw.name)
            if (!isPathSafe(clawDir, data.path)) {
                throw new Error(t('go.invalidPath'))
            }

            const filePath = path.join(clawDir, data.path)
            if (!fs.existsSync(filePath)) {
                throw new Error(t('go.fileNotFound'))
            }

            const content = fs.readFileSync(filePath, 'utf-8')
            return { content, path: data.path }
        }
    )

    ipcMain.handle(
        'updateClawFile',
        (
            _event: IpcMainInvokeEvent,
            id: string,
            data: { path: string; content: string }
        ) => {
            const claw = configStore.findClaw(id)
            if (!claw) throw new Error(t('go.clawNotFound'))

            const clawDir = configStore.getClawDir(claw.name)
            if (!isPathSafe(clawDir, data.path)) {
                throw new Error(t('go.invalidPath'))
            }

            const filePath = path.join(clawDir, data.path)
            const dir = path.dirname(filePath)
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true })
            }

            fs.writeFileSync(filePath, data.content)
            return { success: true }
        }
    )

    ipcMain.handle('exportClaw', (_event: IpcMainInvokeEvent, id: string) => {
        const claw = configStore.findClaw(id)
        if (!claw) throw new Error(t('go.clawNotFound'))

        const clawDir = configStore.getClawDir(claw.name)
        return { path: clawDir }
    })
}

export default registerClawFileHandlers