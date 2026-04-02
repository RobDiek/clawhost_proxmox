import { clawStatus } from '#shared/index'

describe('clawStatus', () => {
    it('has all expected status values', () => {
        expect(clawStatus.running).toBe('running')
        expect(clawStatus.stopped).toBe('stopped')
        expect(clawStatus.initializing).toBe('initializing')
        expect(clawStatus.deleting).toBe('deleting')
        expect(clawStatus.unknown).toBe('unknown')
        expect(clawStatus.awaitingPayment).toBe('awaiting_payment')
    })

    it('has exactly 14 statuses', () => {
        expect(Object.keys(clawStatus)).toHaveLength(14)
    })
})