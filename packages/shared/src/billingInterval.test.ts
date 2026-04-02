import { billingInterval } from '#shared/index'

describe('billingInterval', () => {
    it('has month interval', () => {
        expect(billingInterval.MONTH).toBe('month')
    })

    it('has year interval', () => {
        expect(billingInterval.YEAR).toBe('year')
    })

    it('has exactly 2 intervals', () => {
        expect(Object.keys(billingInterval)).toHaveLength(2)
    })
})