import type { AgentOverviewResponse } from '@/ts/Interfaces'

const demoOverview: AgentOverviewResponse = {
    gateway: {
        active: true,
        reachable: true,
        portListening: true,
        ready: true
    },
    instance: {
        version: '2026.3.28',
        model: 'claude-sonnet-4-5-20250514',
        contextWindow: '200k',
        activeSessions: 2,
        memory: '1.2 GB / 4 GB',
        agents: '3 active',
        heartbeat: '2s ago',
        events: null,
        probes: null
    },
    config: {
        browserEnabled: true,
        commandsEnabled: true,
        tools: ['computer', 'bash', 'text_editor', 'mcp']
    },
    sessions: [
        {
            key: 'session-1',
            name: 'Code Review',
            model: 'claude-sonnet-4-5',
            started: '2026-04-12T14:30:00Z',
            updated: '2026-04-12T15:12:00Z',
            messageCount: 24
        },
        {
            key: 'session-2',
            name: 'Debug API',
            model: 'claude-sonnet-4-5',
            started: '2026-04-12T13:00:00Z',
            updated: '2026-04-12T14:45:00Z',
            messageCount: 18
        }
    ],
    apiStatus: null,
    timestamp: Date.now()
}

export default demoOverview