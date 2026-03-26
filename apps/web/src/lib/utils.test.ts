import { cn } from '@/lib'

describe('cn', () => {
    it('merges class strings', () => {
        expect(cn('foo', 'bar')).toBe('foo bar')
    })

    it('handles conditional classes', () => {
        const isHidden = false
        expect(cn('base', isHidden && 'hidden', 'visible')).toBe('base visible')
    })

    it('handles undefined and null', () => {
        expect(cn('base', undefined, null, 'end')).toBe('base end')
    })

    it('merges conflicting tailwind classes', () => {
        expect(cn('p-4', 'p-2')).toBe('p-2')
    })

    it('merges tailwind color variants', () => {
        expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500')
    })

    it('returns empty string for no args', () => {
        expect(cn()).toBe('')
    })

    it('handles arrays of classes', () => {
        expect(cn(['foo', 'bar'], 'baz')).toBe('foo bar baz')
    })
})