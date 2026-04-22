import { agentStatus } from '@openclaw/shared'
import { getStatusConfig } from '@/lib/agent-utils'

describe('getStatusConfig', () => {
    const config = getStatusConfig()

    it('returns a config for every claw status', () => {
        for (const status of Object.values(agentStatus)) {
            expect(config[status]).toBeDefined()
            expect(config[status].color).toBeTruthy()
            expect(config[status].bgColor).toBeTruthy()
            expect(config[status].label).toBeTruthy()
        }
    })

    it('running is green', () => {
        expect(config[agentStatus.running].color).toBe('bg-green-500')
    })

    it('stopped is red', () => {
        expect(config[agentStatus.stopped].color).toBe('bg-red-500')
    })

    it('starting has pulse', () => {
        expect(config[agentStatus.starting].pulse).toBe(true)
    })

    it('stopping has pulse', () => {
        expect(config[agentStatus.stopping].pulse).toBe(true)
    })

    it('creating is blue with pulse', () => {
        expect(config[agentStatus.creating].color).toBe('bg-blue-500')
        expect(config[agentStatus.creating].pulse).toBe(true)
    })

    it('deleting is red with pulse', () => {
        expect(config[agentStatus.deleting].color).toBe('bg-red-500')
        expect(config[agentStatus.deleting].pulse).toBe(true)
    })

    it('awaitingPayment is yellow with pulse', () => {
        expect(config[agentStatus.awaitingPayment].color).toBe('bg-yellow-500')
        expect(config[agentStatus.awaitingPayment].pulse).toBe(true)
    })

    it('unknown is gray', () => {
        expect(config[agentStatus.unknown].color).toBe('bg-gray-400')
    })

    it('running does not have pulse', () => {
        expect(config[agentStatus.running].pulse).toBeUndefined()
    })
})