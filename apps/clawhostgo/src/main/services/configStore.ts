import type { LocalClawConfig, ConfigFile } from '@/ts/Interfaces'

import fs from 'fs'
import path from 'path'
import os from 'os'
import crypto from 'crypto'

const BASE_DIR = path.join(os.homedir(), '.clawhostgo')
const CONFIG_PATH = path.join(BASE_DIR, 'config.json')

const DEFAULT_CONFIG: ConfigFile = {
    claws: [],
    defaultVersion: '',
    portRange: { min: 18789, max: 18889 },
    createdAt: new Date().toISOString()
}

const ensureDirectories = (): void => {
    const dirs = [
        BASE_DIR,
        path.join(BASE_DIR, 'claws'),
        path.join(BASE_DIR, 'versions'),
        path.join(BASE_DIR, 'node'),
        path.join(BASE_DIR, 'certs')
    ]
    for (const dir of dirs) {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true })
        }
    }
    if (!fs.existsSync(CONFIG_PATH)) {
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 4))
    } else {
        const config = readConfig()
        let dirty = false
        if (!config.createdAt) {
            config.createdAt = new Date().toISOString()
            dirty = true
        }
        for (const claw of config.claws) {
            if (!claw.subdomain) {
                claw.subdomain = generateSlug(claw.id)
                dirty = true
            }
        }
        if (dirty) writeConfig(config)
    }
}

const readConfig = (): ConfigFile => {
    try {
        const raw = fs.readFileSync(CONFIG_PATH, 'utf-8')
        return JSON.parse(raw) as ConfigFile
    } catch {
        return { ...DEFAULT_CONFIG }
    }
}

const writeConfig = (config: ConfigFile): void => {
    const tmpPath = CONFIG_PATH + '.tmp'
    fs.writeFileSync(tmpPath, JSON.stringify(config, null, 4))
    fs.renameSync(tmpPath, CONFIG_PATH)
}

const generateSlug = (id: string): string => {
    const chars = 'abcdefghjkmnpqrstuvwxyz23456789'
    const hash = crypto.createHash('sha256').update(id).digest()
    let slug = ''
    for (let i = 0; i < 8; i++) {
        slug += chars[hash[i] % chars.length]
    }
    return slug
}

const findClaw = (id: string): LocalClawConfig | null => {
    const config = readConfig()
    return config.claws.find((c) => c.id === id) || null
}

const findClawBySubdomain = (subdomain: string): LocalClawConfig | null => {
    const config = readConfig()
    return config.claws.find((c) => c.subdomain === subdomain) || null
}

const addClaw = (claw: LocalClawConfig): void => {
    const config = readConfig()
    config.claws.push(claw)
    writeConfig(config)
}

const removeClaw = (id: string): void => {
    const config = readConfig()
    config.claws = config.claws.filter((c) => c.id !== id)
    writeConfig(config)
}

const updateClaw = (id: string, updates: Partial<LocalClawConfig>): void => {
    const config = readConfig()
    const index = config.claws.findIndex((c) => c.id === id)
    if (index !== -1) {
        config.claws[index] = { ...config.claws[index], ...updates }
        writeConfig(config)
    }
}

const getNextAvailablePort = (): number => {
    const config = readConfig()
    const usedPorts = new Set(config.claws.map((c) => c.port))
    for (
        let port = config.portRange.min;
        port <= config.portRange.max;
        port++
    ) {
        if (!usedPorts.has(port)) {
            return port
        }
    }
    return config.portRange.max + 1
}

const getClawDir = (name: string): string => {
    return path.join(BASE_DIR, 'claws', name)
}

const getVersionDir = (version: string): string => {
    return path.join(BASE_DIR, 'versions', version)
}

const getBaseDir = (): string => BASE_DIR

const configStore = {
    ensureDirectories,
    readConfig,
    writeConfig,
    generateSlug,
    findClaw,
    findClawBySubdomain,
    addClaw,
    removeClaw,
    updateClaw,
    getNextAvailablePort,
    getClawDir,
    getVersionDir,
    getBaseDir
}

export default configStore