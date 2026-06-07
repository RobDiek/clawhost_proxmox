import type { AgentSpec } from '@/ts/Interfaces'

import { agentType } from '@openclaw/shared'

const openclawDefaultConfig = (
    _subdomain: string,
    gatewayToken?: string
): unknown => ({
    gateway: {
        mode: 'local',
        ...(gatewayToken
            ? {
                  auth: {
                      mode: 'token',
                      token: gatewayToken
                  }
              }
            : {}),
        controlUi: {
            allowInsecureAuth: true,
            dangerouslyDisableDeviceAuth: true,
            allowedOrigins: ['*']
        },
        trustedProxies: ['127.0.0.1', '::1']
    },
    commands: {
        restart: true,
        bash: true
    },
    agents: {
        defaults: {
            sandbox: { mode: 'off' }
        },
        list: [
            {
                id: 'main',
                name: 'main'
            }
        ]
    }
})

const hermesDefaultConfig = (
    _subdomain: string,
    gatewayToken?: string
): unknown => ({
    gateway: {
        mode: 'local',
        ...(gatewayToken
            ? {
                  auth: {
                      mode: 'token',
                      token: gatewayToken
                  },
                  remote: {
                      token: gatewayToken
                  }
              }
            : {}),
        controlUi: {
            allowInsecureAuth: true,
            dangerouslyDisableDeviceAuth: true,
            allowedOrigins: ['*']
        },
        trustedProxies: ['127.0.0.1', '::1']
    }
})

const OPENCLAW_SPEC: AgentSpec = {
    type: agentType.OPENCLAW,
    binaryName: 'openclaw',
    npmPackage: 'openclaw',
    configFileName: 'openclaw.json',
    gatewayArgs: (port: number) => ['gateway', '--port', String(port)],
    defaultConfig: openclawDefaultConfig
}

const HERMES_SPEC: AgentSpec = {
    type: agentType.HERMES,
    binaryName: 'hermes',
    npmPackage: '@nousresearch/hermes-agent',
    configFileName: 'hermes.json',
    gatewayArgs: (port: number) => ['gateway', 'start', '--port', String(port)],
    defaultConfig: hermesDefaultConfig
}

const getAgentSpec = (selectedAgentType?: string | null): AgentSpec => {
    if (selectedAgentType === agentType.HERMES) return HERMES_SPEC
    return OPENCLAW_SPEC
}

const agentSpec = { getAgentSpec, OPENCLAW_SPEC, HERMES_SPEC }

export default agentSpec