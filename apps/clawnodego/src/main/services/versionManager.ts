import type { VersionEntry, NpmVersionEntry } from '@/ts/Interfaces'

import { execFile } from 'child_process'
import fs from 'fs'
import path from 'path'
import configStore from '@/main/services/configStore'
import nodeBinary from '@/main/services/nodeBinary'
import agentSpec from '@/main/services/agentSpec'
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

const versionDirName = (selectedAgentType: string, version: string): string => {
    const spec = agentSpec.getAgentSpec(selectedAgentType)
    return spec.type === 'openclaw' ? version : `${spec.type}-${version}`
}

const listInstalled = (selectedAgentType: string): string[] => {
    const versionsDir = path.join(configStore.getBaseDir(), 'versions')
    if (!fs.existsSync(versionsDir)) return []
    const spec = agentSpec.getAgentSpec(selectedAgentType)
    const prefix = spec.type === 'openclaw' ? '' : `${spec.type}-`
    return fs
        .readdirSync(versionsDir)
        .filter((name) => {
            if (prefix) return name.startsWith(prefix)
            return !name.includes('-')
        })
        .map((name) => (prefix ? name.slice(prefix.length) : name))
        .filter((version) => {
            const dirName = versionDirName(selectedAgentType, version)
            const binPath = path.join(
                versionsDir,
                dirName,
                'node_modules',
                '.bin',
                spec.binaryName
            )
            return fs.existsSync(binPath)
        })
}

const installVersionTo = (
    selectedAgentType: string,
    version: string,
    targetDir: string
): Promise<void> => {
    return new Promise((resolve, reject) => {
        const nodePath = nodeBinary.getNodeBinaryPath()
        const npmPath = nodeBinary.getNpmPath()
        const spec = agentSpec.getAgentSpec(selectedAgentType)

        execFile(
            npmPath,
            ['install', `${spec.npmPackage}@${version}`, '--prefix', targetDir],
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

const installVersion = (
    selectedAgentType: string,
    version: string
): Promise<void> => {
    return new Promise((resolve, reject) => {
        const dirName = versionDirName(selectedAgentType, version)
        const versionDir = path.join(
            configStore.getBaseDir(),
            'versions',
            dirName
        )
        if (!fs.existsSync(versionDir)) {
            fs.mkdirSync(versionDir, { recursive: true })
        }

        installVersionTo(selectedAgentType, version, versionDir)
            .then(resolve)
            .catch((error) => {
                try {
                    fs.rmSync(versionDir, { recursive: true, force: true })
                } catch {}
                reject(error)
            })
    })
}

const getAvailableVersions = (
    selectedAgentType: string
): Promise<VersionEntry[]> => {
    return new Promise((resolve) => {
        const nodePath = nodeBinary.getNodeBinaryPath()
        const spec = agentSpec.getAgentSpec(selectedAgentType)
        const pkg = spec.npmPackage
        const script = [
            'Promise.all([',
            `fetch('https://registry.npmjs.org/${encodeURIComponent(pkg)}').then(r=>r.json()),`,
            `fetch('https://api.npmjs.org/versions/${encodeURIComponent(pkg)}/last-week').then(r=>r.json()).catch(()=>({downloads:{}}))`,
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
                    const installed = listInstalled(selectedAgentType)
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
                    const installed = new Set(listInstalled(selectedAgentType))
                    resolve(
                        versions.map((v) => ({
                            ...v,
                            installed: installed.has(v.version)
                        }))
                    )
                } catch {
                    const installed = listInstalled(selectedAgentType)
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

const getLatestVersion = (
    selectedAgentType: string
): Promise<string | null> => {
    return new Promise((resolve) => {
        const nodePath = nodeBinary.getNodeBinaryPath()
        const spec = agentSpec.getAgentSpec(selectedAgentType)
        const script = `fetch('https://registry.npmjs.org/${encodeURIComponent(spec.npmPackage)}/latest').then(r=>r.ok?r.json():null).then(d=>{if(d&&typeof d.version==='string')console.log(d.version)}).catch(()=>{})`

        execFile(
            nodePath,
            ['-e', script],
            { encoding: 'utf-8', timeout: 10000 },
            (error, stdout) => {
                const trimmed = (stdout || '').trim()
                if (error || !trimmed || trimmed === 'undefined') {
                    resolve(null)
                    return
                }
                resolve(trimmed)
            }
        )
    })
}

const getVersionBinaryPath = (
    selectedAgentType: string,
    version: string
): string => {
    const spec = agentSpec.getAgentSpec(selectedAgentType)
    const dirName = versionDirName(selectedAgentType, version)
    return path.join(
        configStore.getBaseDir(),
        'versions',
        dirName,
        'node_modules',
        '.bin',
        spec.binaryName
    )
}

const getAgentBinaryPath = (
    selectedAgentType: string,
    agentDir: string
): string => {
    const spec = agentSpec.getAgentSpec(selectedAgentType)
    return path.join(agentDir, 'node_modules', '.bin', spec.binaryName)
}

const versionManager = {
    listInstalled,
    installVersion,
    installVersionTo,
    getAvailableVersions,
    getLatestVersion,
    getVersionBinaryPath,
    getAgentBinaryPath
}

export default versionManager