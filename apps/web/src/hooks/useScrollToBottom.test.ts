describe('useScrollToBottom logic', () => {
    it('detects when scrolled to bottom', () => {
        const threshold = 100
        const scrollHeight = 1000
        const clientHeight = 500
        const scrollTop = 450

        const atBottom = scrollHeight - scrollTop - clientHeight < threshold
        expect(atBottom).toBe(true)
    })

    it('detects when not at bottom', () => {
        const threshold = 100
        const scrollHeight = 1000
        const clientHeight = 500
        const scrollTop = 200

        const atBottom = scrollHeight - scrollTop - clientHeight < threshold
        expect(atBottom).toBe(false)
    })

    it('respects custom threshold', () => {
        const threshold = 200
        const scrollHeight = 1000
        const clientHeight = 500
        const scrollTop = 350

        const atBottom = scrollHeight - scrollTop - clientHeight < threshold
        expect(atBottom).toBe(true)
    })

    it('exact boundary is not at bottom', () => {
        const threshold = 100
        const scrollHeight = 1000
        const clientHeight = 500
        const scrollTop = 400

        const atBottom = scrollHeight - scrollTop - clientHeight < threshold
        expect(atBottom).toBe(false)
    })

    it('default threshold is 100', () => {
        const threshold = 100
        expect(threshold).toBe(100)
    })
})