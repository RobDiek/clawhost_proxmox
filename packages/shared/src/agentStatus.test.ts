import { agentStatus } from '#shared/index'

describe('agentStatus', () => {
    it('has all expected status values', () => {
        expect(agentStatus.running).toBe('running')
        expect(agentStatus.stopped).toBe('stopped')
        expect(agentStatus.initializing).toBe('initializing')
        expect(agentStatus.deleting).toBe('deleting')
        expect(agentStatus.unknown).toBe('unknown')
        expect(agentStatus.awaitingPayment).toBe('awaiting_payment')
    })

    it('has exactly 14 statuses', () => {
        expect(Object.keys(agentStatus)).toHaveLength(14)
    })
})