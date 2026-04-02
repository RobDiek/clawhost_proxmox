import stripMetadata from '@/hooks/useAgentChat/stripMetadata'

describe('stripMetadata', () => {
    it('returns plain text unchanged', () => {
        expect(stripMetadata('Hello world')).toBe('Hello world')
    })

    it('returns empty string for empty input', () => {
        expect(stripMetadata('')).toBe('')
    })

    it('strips leading gateway timestamp', () => {
        const text = '[Mon 2024-06-15 14:30 UTC] Hello there'
        expect(stripMetadata(text)).toBe('Hello there')
    })

    it('strips metadata marker and content after it', () => {
        const text =
            'Conversation info (untrusted metadata):\nuser: test\nrole: admin\n\nActual message here'
        expect(stripMetadata(text)).toBe('Actual message here')
    })

    it('strips metadata with timestamp after marker', () => {
        const text =
            'Conversation info (untrusted metadata):\nsome data\n[Fri 2024-01-10 09:00 EST] Real message'
        expect(stripMetadata(text)).toBe('Real message')
    })

    it('does not strip timestamp in the middle of text', () => {
        const text = 'Some text [Mon 2024-06-15 14:30 UTC] more text'
        expect(stripMetadata(text)).toBe(
            'Some text [Mon 2024-06-15 14:30 UTC] more text'
        )
    })
})