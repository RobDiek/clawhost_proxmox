import type { Agent } from '@/ts/Interfaces'

import { subscriptionStatus } from '@openclaw/shared'

const demoAgents: Agent[] = [
    {
        id: 'demo-1',
        name: 'personal-agent',
        agentType: 'openclaw',
        emoji: null,
        emojiColor: null,
        status: 'running',
        ip: '45.33.21.98',
        planId: 'cx22',
        location: 'Frankfurt, DE',
        rootPassword: null,
        hasRootPassword: false,
        sshKeyId: null,
        providerServerId: '48291053',
        subdomain: 'personal-agent',
        gatewayToken: null,
        hostKeyFingerprint: null,
        subscriptionStatus: subscriptionStatus.active,
        polarSubscriptionId: 'demo-sub-1',
        billingInterval: 'month',
        currentPeriodStart: '2026-04-01T00:00:00Z',
        currentPeriodEnd: '2026-05-01T00:00:00Z',
        deletionScheduledAt: null,
        lastSubdomainChangedAt: null,
        createdAt: '2026-01-15T00:00:00Z'
    },
    {
        id: 'demo-2',
        name: 'hermes-worker',
        agentType: 'hermes',
        emoji: null,
        emojiColor: null,
        status: 'running',
        ip: '78.46.12.44',
        planId: 'cx32',
        location: 'Ashburn, US',
        rootPassword: null,
        hasRootPassword: false,
        sshKeyId: null,
        providerServerId: '58103742',
        subdomain: 'hermes-worker',
        gatewayToken: null,
        hostKeyFingerprint: null,
        subscriptionStatus: subscriptionStatus.active,
        polarSubscriptionId: 'demo-sub-2',
        billingInterval: 'month',
        currentPeriodStart: '2026-04-01T00:00:00Z',
        currentPeriodEnd: '2026-05-01T00:00:00Z',
        deletionScheduledAt: null,
        lastSubdomainChangedAt: null,
        createdAt: '2026-03-10T00:00:00Z'
    }
]

export default demoAgents