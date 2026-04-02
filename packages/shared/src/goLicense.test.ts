import { goLicense } from '#shared/index'

describe('goLicense', () => {
    it('has PRICE of 50', () => {
        expect(goLicense.PRICE).toBe(50)
    })
})