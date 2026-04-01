import type { VersionEntry, NpmVersionEntry } from '@/ts/Interfaces'

import { execFile } from 'child_process'
import fs from 'fs'
import path from 'path'
import configStore from '@/main/services/configStore'
import nodeBinary from '@/main/services/nodeBinary'
import { t } from '@openclaw/i18n'

const extractNpmError = (raw: string): string => {
    if (raw.includes('ENOSPC')) return t('go.diskFull')
    if (raw.includes('EACCES')) return t('go.permissionDenied')
    if (raw.includes('ETIMEOUT') || raw.includes('ETIMEDOUT'))
        return t('go.networkTimeout')
    const errLine = raw
        .split('\n')
        .find((l) => l.startsWith('npm error') || l.startsWith('npm ERR!'))
    if (errLine) return errLine.slice(0, 200)
    return raw.slice(0, 200)
}

const listInstalled = (): string[] => {
    const versionsDir = path.join(configStore.getBaseDir(), 'versions')
    if (!fs.existsSync(versionsDir)) return []
    return fs.readdirSync(versionsDir).filter((name) => {
        const binPath = path.join(
            versionsDir,
            name,
            'node_modules',
            '.bin',
            'openclaw'
        )
        return fs.existsSync(binPath)
    })
}

const installVersion = (version: string): Promise<void> => {
    return new Promise((resolve, reject) => {
        const versionDir = configStore.getVersionDir(version)
        if (!fs.existsSync(versionDir)) {
            fs.mkdirSync(versionDir, { recursive: true })
        }

        const nodePath = nodeBinary.getNodeBinaryPath()
        const npmPath = nodeBinary.getNpmPath()

        execFile(
            npmPath,
            ['install', `openclaw@${version}`, '--prefix', versionDir],
            {
                env: {
                    ...process.env,
                    PATH: `${path.dirname(nodePath)}:${process.env.PATH}`
                },
                timeout: 120000
            },
            (error) => {
                if (error) {
                    try {
                        fs.rmSync(versionDir, { recursive: true, force: true })
                    } catch {}
                    reject(
                        new Error(
                            t('go.failedToInstallVersion', {
                                version,
                                reason: extractNpmError(error.message)
                            })
                        )
                    )
                    return
                }
                resolve()
            }
        )
    })
}

const getAvailableVersions = (): Promise<VersionEntry[]> => {
    return new Promise((resolve) => {
        const nodePath = nodeBinary.getNodeBinaryPath()
        const script = [
            'Promise.all([',
            "fetch('https://registry.npmjs.org/openclaw').then(r=>r.json()),",
            "fetch('https://api.npmjs.org/versions/openclaw/last-week').then(r=>r.json()).catch(()=>({downloads:{}}))",
            ']).then(([registry,dl])=>{',
            'const times=registry.time||{};',
            'const downloads=dl.downloads||{};',
            'const versions=Object.entries(times)',
            '.filter(([k])=>k!=="created"&&k!=="modified")',
            '.map(([v,t])=>({version:v,publishedAt:t,downloads:downloads[v]||0}))',
            '.sort((a,b)=>new Date(b.publishedAt)-new Date(a.publishedAt));',
            'console.log(JSON.stringify(versions))',
            '})'
        ].join('')

        execFile(
            nodePath,
            ['-e', script],
            { encoding: 'utf-8', timeout: 15000 },
            (error, stdout) => {
                if (error || !stdout.trim()) {
                    const installed = listInstalled()
                    resolve(
                        installed.map((v) => ({
                            version: v,
                            publishedAt: new Date().toISOString(),
                            downloads: 0,
                            installed: true
                        }))
                    )
                    return
                }
                try {
                    const versions = JSON.parse(
                        stdout.trim()
                    ) as NpmVersionEntry[]
                    const installed = new Set(listInstalled())
                    resolve(
                        versions.map((v) => ({
                            ...v,
                            installed: installed.has(v.version)
                        }))
                    )
                } catch {
                    const installed = listInstalled()
                    resolve(
                        installed.map((v) => ({
                            version: v,
                            publishedAt: new Date().toISOString(),
                            downloads: 0,
                            installed: true
                        }))
                    )
                }
            }
        )
    })
}

const getLatestVersion = (): Promise<string | null> => {
    return new Promise((resolve) => {
        const nodePath = nodeBinary.getNodeBinaryPath()
        const script =
            "fetch('https://registry.npmjs.org/openclaw/latest').then(r=>r.json()).then(d=>console.log(d.version))"

        execFile(
            nodePath,
            ['-e', script],
            { encoding: 'utf-8', timeout: 10000 },
            (error, stdout) => {
                if (error || !stdout.trim()) {
                    resolve(null)
                    return
                }
                resolve(stdout.trim())
            }
        )
    })
}

const getVersionBinaryPath = (version: string): string => {
    return path.join(
        configStore.getVersionDir(version),
        'node_modules',
        '.bin',
        'openclaw'
    )
}

const installVersionTo = (
    version: string,
    targetDir: string
): Promise<void> => {
    return new Promise((resolve, reject) => {
        const nodePath = nodeBinary.getNodeBinaryPath()
        const npmPath = nodeBinary.getNpmPath()

        execFile(
            npmPath,
            ['install', `openclaw@${version}`, '--prefix', targetDir],
            {
                env: {
                    ...process.env,
                    PATH: `${path.dirname(nodePath)}:${process.env.PATH}`
                },
                timeout: 120000
            },
            (error) => {
                if (error) {
                    reject(
                        new Error(
                            t('go.failedToInstallVersion', {
                                version,
                                reason: extractNpmError(error.message)
                            })
                        )
                    )
                    return
                }
                resolve()
            }
        )
    })
}

const getClawBinaryPath = (clawDir: string): string => {
    return path.join(clawDir, 'node_modules', '.bin', 'openclaw')
}

const versionManager = {
    listInstalled,
    installVersion,
    installVersionTo,
    getAvailableVersions,
    getLatestVersion,
    getVersionBinaryPath,
    getClawBinaryPath
}

export default versionManager