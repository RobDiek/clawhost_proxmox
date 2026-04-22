import { agentProvider } from '#shared/index'

describe('agentProvider', () => {
    it('has hetzner provider', () => {
        expect(agentProvider.hetzner).toBe('hetzner')
    })

    it('has local provider', () => {
        expect(agentProvider.local).toBe('local')
    })

    it('has exactly 2 providers', () => {
        expect(Object.keys(agentProvider)).toHaveLength(2)
    })
})