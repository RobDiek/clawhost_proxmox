import { clawProvider } from '#shared/index'

describe('clawProvider', () => {
    it('has hetzner provider', () => {
        expect(clawProvider.hetzner).toBe('hetzner')
    })

    it('has local provider', () => {
        expect(clawProvider.local).toBe('local')
    })

    it('has exactly 2 providers', () => {
        expect(Object.keys(clawProvider)).toHaveLength(2)
    })
})