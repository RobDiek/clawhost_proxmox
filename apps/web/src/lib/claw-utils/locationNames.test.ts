import { locationNames } from '@/lib/claw-utils'

describe('locationNames', () => {
    it('is a non-empty object', () => {
        expect(Object.keys(locationNames).length).toBeGreaterThan(0)
    })

    it('maps Hetzner location codes', () => {
        expect(locationNames['fsn1']).toBe('Falkenstein, Germany')
        expect(locationNames['nbg1']).toBe('Nuremberg, Germany')
        expect(locationNames['hel1']).toBe('Helsinki, Finland')
    })

    it('maps US location codes', () => {
        expect(locationNames['ash']).toBe('Ashburn, USA')
        expect(locationNames['hil']).toBe('Hillsboro, USA')
    })

    it('all values are non-empty strings', () => {
        for (const [key, value] of Object.entries(locationNames)) {
            expect(typeof key).toBe('string')
            expect(typeof value).toBe('string')
            expect(value.length).toBeGreaterThan(0)
        }
    })
})