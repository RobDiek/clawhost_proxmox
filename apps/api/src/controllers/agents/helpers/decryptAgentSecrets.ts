import { decrypt } from '@/lib/encryption'

const decryptAgentSecrets = <
    T extends { rootPassword?: string | null; gatewayToken?: string | null }
>(
    agent: T
): T => ({
    ...agent,
    rootPassword: agent.rootPassword
        ? decrypt(agent.rootPassword)
        : agent.rootPassword,
    gatewayToken: agent.gatewayToken
        ? decrypt(agent.gatewayToken)
        : agent.gatewayToken
})

export default decryptAgentSecrets