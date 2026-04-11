import { BASE_DIR } from '@/controllers/agents/helpers'

describe('BASE_DIR', () => {
    it('points to openclaw home directory', () => {
        expect(BASE_DIR).toBe('/home/openclaw/.openclaw')
    })
})