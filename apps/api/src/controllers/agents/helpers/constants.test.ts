import { DOMAIN } from '@/controllers/agents/helpers'

describe('DOMAIN', () => {
    it('is clawhost.cloud', () => {
        expect(DOMAIN).toBe('clawhost.cloud')
    })
})