/**
 * LLM Guard Service — Scan input/output for prompt injection, toxicity, PII.
 * Runs the Python scanner on the client VPS via SSH.
 */

import { Client } from 'ssh2'
import { readFileSync } from 'fs'

const SSH_KEY_PATH = process.env.MASTER_SSH_KEY_PATH || '/root/.ssh/openclaw_master'

let sshKeyCache: Buffer | null = null
function getSSHKey(): Buffer {
    if (!sshKeyCache) sshKeyCache = readFileSync(SSH_KEY_PATH)
    return sshKeyCache
}

function sshExec(ip: string, command: string, password?: string, timeoutMs = 30_000): Promise<string> {
    return new Promise((resolve, reject) => {
        const conn = new Client()
        let output = ''
        const timer = setTimeout(() => { conn.end(); reject(new Error('SSH timeout')) }, timeoutMs)

        conn.on('ready', () => {
            conn.exec(command, (err, stream) => {
                if (err) { conn.end(); clearTimeout(timer); return reject(err) }
                stream.on('data', (d: Buffer) => { output += d.toString() })
                stream.stderr.on('data', () => { /* ignore stderr */ })
                stream.on('close', () => { conn.end(); clearTimeout(timer); resolve(output.trim()) })
            })
        }).on('error', (err) => { clearTimeout(timer); reject(err) })

        const opts: Record<string, unknown> = { host: ip, port: 22, username: 'root' }
        if (password) opts.password = password
        try { opts.privateKey = getSSHKey() } catch { if (!password) return reject(new Error('No SSH credentials')) }
        conn.connect(opts)
    })
}

export interface ScanResult {
    safe: boolean
    score: number
    flagged: string[]
    sanitized: string
    error?: string
}

/**
 * Scan text for security threats (prompt injection, toxicity, PII).
 */
export async function scanText(
    ip: string,
    text: string,
    direction: 'input' | 'output' = 'input',
    password?: string
): Promise<ScanResult> {
    // Sanitize input for shell safety
    const safeText = text.replace(/'/g, "'\\''").slice(0, 10_000)
    const payload = JSON.stringify({ text: safeText, direction })
    const b64 = Buffer.from(payload).toString('base64')

    try {
        const raw = await sshExec(
            ip,
            `echo '${b64}' | base64 -d | python3 /opt/openclaw/llm-guard-scan.py 2>/dev/null`,
            password,
            20_000
        )

        return JSON.parse(raw)
    } catch {
        // Fail closed — if scanner is unavailable, block and report
        return { safe: false, score: 1, flagged: ['ScannerUnavailable'], sanitized: text, error: 'scanner_unavailable' }
    }
}

/**
 * Check if LLM Guard is installed on VPS.
 */
export async function checkLlmGuardInstalled(ip: string, password?: string): Promise<boolean> {
    try {
        const result = await sshExec(
            ip,
            'python3 -c "import llm_guard; print(llm_guard.__version__)" 2>/dev/null || echo "not_installed"',
            password
        )
        return !result.includes('not_installed')
    } catch {
        return false
    }
}

export default { scanText, checkLlmGuardInstalled }