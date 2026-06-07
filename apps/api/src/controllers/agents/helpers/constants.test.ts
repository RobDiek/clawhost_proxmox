import { DOMAIN } from '@/controllers/agents/helpers'

describe('DOMAIN', () => {
    it('is clawnode.cloud', () => {
        expect(DOMAIN).toBe('clawnode.cloud')
    })
})