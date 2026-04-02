import extractTimestamp from '@/hooks/useAgentChat/extractTimestamp'

describe('extractTimestamp', () => {
    it('parses gateway timestamp format', () => {
        const result = extractTimestamp('[Mon 2024-06-15 14:30 UTC] Hello')
        expect(result).toBe('2024-06-15T14:30:00.000Z')
    })

    it('parses various day names', () => {
        expect(extractTimestamp('[Fri 2025-01-10 09:00 EST] msg')).toBeTruthy()
        expect(extractTimestamp('[Sun 2025-12-25 23:59 PST] msg')).toBeTruthy()
    })

    it('parses Current time format with AM', () => {
        const text = 'Current time: Monday, January 15th, 2024 — 9:30 AM (EST)'
        const result = extractTimestamp(text)
        expect(result).toBe('2024-01-15T09:30:00.000Z')
    })

    it('parses Current time format with PM', () => {
        const text = 'Current time: Friday, March 1st, 2024 — 2:45 PM (UTC)'
        const result = extractTimestamp(text)
        expect(result).toBe('2024-03-01T14:45:00.000Z')
    })

    it('handles 12 PM correctly', () => {
        const text = 'Current time: Tuesday, June 10th, 2024 — 12:00 PM (UTC)'
        const result = extractTimestamp(text)
        expect(result).toBe('2024-06-10T12:00:00.000Z')
    })

    it('handles 12 AM correctly', () => {
        const text = 'Current time: Wednesday, July 3rd, 2024 — 12:15 AM (UTC)'
        const result = extractTimestamp(text)
        expect(result).toBe('2024-07-03T00:15:00.000Z')
    })

    it('returns null for text with no timestamp', () => {
        expect(extractTimestamp('just regular text')).toBeNull()
    })

    it('returns null for empty string', () => {
        expect(extractTimestamp('')).toBeNull()
    })

    it('returns null for partial timestamp', () => {
        expect(extractTimestamp('[Mon 2024-06-15]')).toBeNull()
    })

    it('prefers gateway format when present', () => {
        const text =
            '[Tue 2024-03-05 10:00 UTC] Current time: Tuesday, March 5th, 2024 — 10:00 AM (UTC)'
        const result = extractTimestamp(text)
        expect(result).toBe('2024-03-05T10:00:00.000Z')
    })
})