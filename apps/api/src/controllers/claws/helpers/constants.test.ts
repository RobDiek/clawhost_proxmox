import { DOMAIN } from '@/controllers/claws/helpers'

describe('DOMAIN', () => {
    it('is clawhost.cloud', () => {
        expect(DOMAIN).toBe('clawhost.cloud')
    })
})