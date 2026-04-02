import { getAgentStatusConfig } from '@/lib/claw-utils'

describe('getAgentStatusConfig', () => {
    it('returns green config for running', () => {
        const config = getAgentStatusConfig('running')
        expect(config.color).toBe('bg-green-500')
        expect(config.bgColor).toBe('bg-green-500/10')
        expect(config.pulse).toBeUndefined()
    })

    it('returns gray config for stopped', () => {
        const config = getAgentStatusConfig('stopped')
        expect(config.color).toBe('bg-gray-400')
    })

    it('returns gray config for idle', () => {
        const config = getAgentStatusConfig('idle')
        expect(config.color).toBe('bg-gray-400')
    })

    it('returns yellow config with pulse for starting', () => {
        const config = getAgentStatusConfig('starting')
        expect(config.color).toBe('bg-yellow-500')
        expect(config.pulse).toBe(true)
    })

    it('returns yellow config with pulse for stopping', () => {
        const config = getAgentStatusConfig('stopping')
        expect(config.color).toBe('bg-yellow-500')
        expect(config.pulse).toBe(true)
    })

    it('returns red config for error', () => {
        const config = getAgentStatusConfig('error')
        expect(config.color).toBe('bg-red-500')
    })

    it('returns red config for crashed', () => {
        const config = getAgentStatusConfig('crashed')
        expect(config.color).toBe('bg-red-500')
    })

    it('returns red config for unknown', () => {
        const config = getAgentStatusConfig('unknown')
        expect(config.color).toBe('bg-red-500')
    })

    it('returns red config for any unrecognized status', () => {
        const config = getAgentStatusConfig('something-random')
        expect(config.color).toBe('bg-red-500')
    })

    it('always returns a label string', () => {
        const statuses = [
            'running',
            'stopped',
            'starting',
            'stopping',
            'error',
            'unknown'
        ]
        for (const status of statuses) {
            expect(typeof getAgentStatusConfig(status).label).toBe('string')
        }
    })
})