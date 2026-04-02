import { TRUNCATE_LENGTHS } from '@/lib'

describe('TRUNCATE_LENGTHS', () => {
    it('has all expected keys', () => {
        expect(TRUNCATE_LENGTHS.PANEL_NAME).toBe(26)
        expect(TRUNCATE_LENGTHS.PANEL_CLAW_SUBTITLE).toBe(18)
        expect(TRUNCATE_LENGTHS.NODE_AGENT_NAME).toBe(21)
        expect(TRUNCATE_LENGTHS.NODE_CLAW_NAME).toBe(7)
        expect(TRUNCATE_LENGTHS.SIDEBAR_CLAW_NAME).toBe(13)
        expect(TRUNCATE_LENGTHS.SIDEBAR_AGENT_NAME).toBe(11)
    })

    it('all values are positive numbers', () => {
        for (const value of Object.values(TRUNCATE_LENGTHS)) {
            expect(value).toBeGreaterThan(0)
        }
    })
})