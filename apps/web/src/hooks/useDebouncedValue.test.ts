describe('useDebouncedValue logic', () => {
    beforeEach(() => {
        vi.useFakeTimers()
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it('debounce pattern delays value updates', () => {
        let current = 'initial'
        let timeout: ReturnType<typeof setTimeout> | null = null

        const update = (value: string, delay: number) => {
            if (timeout) clearTimeout(timeout)
            timeout = setTimeout(() => {
                current = value
            }, delay)
        }

        update('changed', 300)
        expect(current).toBe('initial')

        vi.advanceTimersByTime(299)
        expect(current).toBe('initial')

        vi.advanceTimersByTime(1)
        expect(current).toBe('changed')
    })

    it('debounce resets on rapid changes', () => {
        let current = 'a'
        let timeout: ReturnType<typeof setTimeout> | null = null

        const update = (value: string, delay: number) => {
            if (timeout) clearTimeout(timeout)
            timeout = setTimeout(() => {
                current = value
            }, delay)
        }

        update('b', 300)
        vi.advanceTimersByTime(100)
        update('c', 300)
        vi.advanceTimersByTime(100)
        update('d', 300)
        vi.advanceTimersByTime(300)

        expect(current).toBe('d')
    })

    it('each independent debounce resolves separately', () => {
        let value1 = 'start'
        let value2 = 'start'

        const t1 = setTimeout(() => {
            value1 = 'end1'
        }, 200)
        const t2 = setTimeout(() => {
            value2 = 'end2'
        }, 500)

        vi.advanceTimersByTime(200)
        expect(value1).toBe('end1')
        expect(value2).toBe('start')

        vi.advanceTimersByTime(300)
        expect(value2).toBe('end2')

        clearTimeout(t1)
        clearTimeout(t2)
    })
})