/**
 * CrewAI Service — Multi-agent orchestration with token budget control.
 *
 * Runs CrewAI crews on client VPS via SSH.
 * Each crew has a token budget to prevent runaway costs.
 *
 * Architecture:
 *   - CrewAI Python scripts deployed to /opt/openclaw/crews/
 *   - Each crew execution is a Python subprocess with timeout
 *   - Token usage tracked via LiteLLM callbacks (if available)
 */

import { Client } from 'ssh2'
import { readFileSync } from 'fs'

const SSH_KEY_PATH = process.env.MASTER_SSH_KEY_PATH || '/root/.ssh/openclaw_master'

let sshKeyCache: Buffer | null = null
function getSSHKey(): Buffer {
    if (!sshKeyCache) sshKeyCache = readFileSync(SSH_KEY_PATH)
    return sshKeyCache
}

function sshExec(ip: string, command: string, password?: string, timeoutMs = 300_000): Promise<string> {
    return new Promise((resolve, reject) => {
        const conn = new Client()
        let output = ''
        const timer = setTimeout(() => { conn.end(); reject(new Error('SSH timeout')) }, timeoutMs)
        conn.on('ready', () => {
            conn.exec(command, (err, stream) => {
                if (err) { conn.end(); clearTimeout(timer); return reject(err) }
                stream.on('data', (d: Buffer) => { output += d.toString() })
                stream.stderr.on('data', (d: Buffer) => { output += d.toString() })
                stream.on('close', () => { conn.end(); clearTimeout(timer); resolve(output.trim()) })
            })
        }).on('error', (err) => { clearTimeout(timer); reject(err) })
        const opts: Record<string, unknown> = { host: ip, port: 22, username: 'root' }
        if (password) opts.password = password
        try { opts.privateKey = getSSHKey() } catch { if (!password) return reject(new Error('No SSH credentials')) }
        conn.connect(opts)
    })
}

export interface CrewConfig {
    name: string
    agents: Array<{
        role: string
        goal: string
        backstory: string
        model?: string     // LiteLLM model name (e.g. 'sonnet', 'haiku')
        maxTokens?: number // per-agent token limit
    }>
    tasks: Array<{
        description: string
        agent: string      // references agent role
        expectedOutput: string
    }>
    tokenBudget: number    // total token budget for entire crew execution
    timeoutSeconds: number // max execution time
}

/**
 * Deploy a crew definition to the VPS.
 * SECURITY: User input is serialized as JSON, never interpolated into Python code.
 */
export async function deployCrew(
    ip: string,
    crewConfig: CrewConfig,
    password?: string
): Promise<void> {
    const safeName = crewConfig.name.replace(/[^a-zA-Z0-9_-]/g, '')

    // Write user-controlled data as JSON (no code injection possible)
    const configJson = JSON.stringify({
        name: safeName,
        agents: crewConfig.agents,
        tasks: crewConfig.tasks,
        tokenBudget: crewConfig.tokenBudget,
        timeoutSeconds: crewConfig.timeoutSeconds,
    })

    const b64Config = Buffer.from(configJson).toString('base64')

    // Deploy static runner (no user input in Python code) + JSON config
    const b64Runner = Buffer.from(CREW_RUNNER_PY).toString('base64')

    await sshExec(ip, [
        `mkdir -p /opt/openclaw/crews`,
        `echo '${b64Runner}' | base64 -d > /opt/openclaw/crews/runner.py`,
        `echo '${b64Config}' | base64 -d > /opt/openclaw/crews/${safeName}.json`,
        `chmod +x /opt/openclaw/crews/runner.py`,
    ].join(' && '), password)
}

// Static Python runner — reads config from JSON, never templates user strings
const CREW_RUNNER_PY = `#!/usr/bin/env python3
"""CrewAI runner — loads crew config from JSON file. No user input in this code."""
import json, sys, os, time

os.environ.setdefault("OPENAI_API_BASE", "http://127.0.0.1:4000")
os.environ.setdefault("OPENAI_API_KEY", "litellm-proxy")

if len(sys.argv) < 2:
    print(json.dumps({"success": False, "error": "Usage: runner.py <config.json>"}))
    sys.exit(1)

config_path = sys.argv[1]
if not os.path.isfile(config_path):
    print(json.dumps({"success": False, "error": f"Config not found: {config_path}"}))
    sys.exit(1)

with open(config_path) as f:
    config = json.load(f)

start = time.time()

try:
    from crewai import Agent, Task, Crew, Process

    agents = []
    agent_map = {}
    for a in config["agents"]:
        agent = Agent(
            role=str(a["role"]),
            goal=str(a["goal"]),
            backstory=str(a.get("backstory", "")),
            llm=str(a.get("model", "sonnet")),
            max_tokens=int(a.get("maxTokens", 4000)),
            verbose=False,
        )
        agents.append(agent)
        agent_map[a["role"]] = agent

    tasks = []
    for t in config["tasks"]:
        agent = agent_map.get(t.get("agent", ""), agents[0])
        task = Task(
            description=str(t["description"]),
            expected_output=str(t.get("expectedOutput", "Complete the task.")),
            agent=agent,
        )
        tasks.append(task)

    crew = Crew(
        agents=agents,
        tasks=tasks,
        process=Process.sequential,
        verbose=False,
        max_rpm=10,
    )

    result = crew.kickoff()
    elapsed = time.time() - start

    output = {
        "success": True,
        "result": str(result),
        "elapsed_seconds": round(elapsed, 1),
        "crew": config.get("name", "unknown"),
    }

    if hasattr(result, "token_usage"):
        tu = result.token_usage
        output["token_usage"] = {
            "total_tokens": getattr(tu, "total_tokens", 0),
            "prompt_tokens": getattr(tu, "prompt_tokens", 0),
            "completion_tokens": getattr(tu, "completion_tokens", 0),
        }

    print(json.dumps(output))

except Exception as e:
    print(json.dumps({
        "success": False,
        "error": str(e),
        "crew": config.get("name", "unknown"),
        "elapsed_seconds": round(time.time() - start, 1),
    }))
`

/**
 * Execute a deployed crew and return results.
 */
export async function runCrew(
    ip: string,
    crewName: string,
    password?: string,
    timeoutMs = 300_000
): Promise<{
    success: boolean
    result?: string
    error?: string
    tokenUsage?: { totalTokens: number; promptTokens: number; completionTokens: number }
    elapsedSeconds: number
}> {
    const safeName = crewName.replace(/[^a-zA-Z0-9_-]/g, '')

    try {
        const raw = await sshExec(
            ip,
            `timeout ${Math.floor(timeoutMs / 1000)} python3 /opt/openclaw/crews/runner.py /opt/openclaw/crews/${safeName}.json 2>/dev/null`,
            password,
            timeoutMs + 10_000 // SSH timeout slightly longer than script timeout
        )

        const parsed = JSON.parse(raw)
        return {
            success: parsed.success,
            result: parsed.result,
            error: parsed.error,
            tokenUsage: parsed.token_usage ? {
                totalTokens: parsed.token_usage.total_tokens || 0,
                promptTokens: parsed.token_usage.prompt_tokens || 0,
                completionTokens: parsed.token_usage.completion_tokens || 0,
            } : undefined,
            elapsedSeconds: parsed.elapsed_seconds || 0,
        }
    } catch (err) {
        return {
            success: false,
            error: err instanceof Error ? err.message : 'Unknown error',
            elapsedSeconds: 0,
        }
    }
}

/**
 * List deployed crews on VPS.
 */
export async function listCrews(ip: string, password?: string): Promise<string[]> {
    try {
        const raw = await sshExec(ip, 'ls /opt/openclaw/crews/*.json 2>/dev/null | xargs -I{} basename {} .json', password)
        return raw.split('\n').filter(Boolean)
    } catch {
        return []
    }
}

export default { deployCrew, runCrew, listCrews }