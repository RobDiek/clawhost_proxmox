const formatStars = (count: number): string => {
    if (count >= 1000)
        return `${(count / 1000).toFixed(1).replace(/\.0$/, '')}k`
    return count.toString()
}

describe('formatStars', () => {
    it('formats numbers under 1000 as-is', () => {
        expect(formatStars(0)).toBe('0')
        expect(formatStars(1)).toBe('1')
        expect(formatStars(999)).toBe('999')
    })

    it('formats 1000 as 1k', () => {
        expect(formatStars(1000)).toBe('1k')
    })

    it('formats 1500 as 1.5k', () => {
        expect(formatStars(1500)).toBe('1.5k')
    })

    it('formats 10000 as 10k', () => {
        expect(formatStars(10000)).toBe('10k')
    })

    it('formats 12300 as 12.3k', () => {
        expect(formatStars(12300)).toBe('12.3k')
    })

    it('drops trailing .0', () => {
        expect(formatStars(2000)).toBe('2k')
        expect(formatStars(5000)).toBe('5k')
    })
})