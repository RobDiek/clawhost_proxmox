import type { AgentConfig } from '@/ts/Interfaces'

import { agentType } from '@openclaw/shared'

const OPENCLAW_CONFIG: AgentConfig = {
    user: 'openclaw',
    homeDir: '/home/openclaw',
    configDir: '/home/openclaw/.openclaw',
    configFile: '/home/openclaw/.openclaw/openclaw.json',
    serviceName: 'openclaw-gateway',
    logFile: '/var/log/openclaw-gateway.log',
    nginxSite: 'openclaw',
    binary: 'openclaw',
    npmPackage: 'openclaw',
    githubRepo: null,
    doctorCommand: 'openclaw doctor --fix',
    versionCommand: 'openclaw --version'
}

const HERMES_CONFIG: AgentConfig = {
    user: 'hermes',
    homeDir: '/home/hermes',
    configDir: '/home/hermes/.hermes',
    configFile: '/home/hermes/.hermes/hermes.json',
    serviceName: 'hermes-gateway',
    logFile: '/var/log/hermes-gateway.log',
    nginxSite: 'hermes-gateway',
    binary: 'hermes',
    npmPackage: null,
    githubRepo: 'NousResearch/hermes-agent',
    doctorCommand: null,
    versionCommand: 'hermes --version'
}

const getAgentConfig = (selectedAgentType?: string | null): AgentConfig => {
    if (selectedAgentType === agentType.HERMES) return HERMES_CONFIG
    return OPENCLAW_CONFIG
}

export default getAgentConfig