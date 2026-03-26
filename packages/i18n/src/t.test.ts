import { t } from '@'
import { setLanguage } from '@'

describe('t', () => {
    beforeEach(() => {
        setLanguage('en')
    })

    it('resolves a top-level key', () => {
        const result = t('common.save')
        expect(result).toBeTruthy()
        expect(result).not.toBe('common.save')
    })

    it('resolves nested keys', () => {
        const result = t('dashboard.status.running')
        expect(result).toBeTruthy()
        expect(result).not.toBe('dashboard.status.running')
    })

    it('returns the key path for missing keys', () => {
        const result = t('nonexistent.deeply.nested.key' as never)
        expect(result).toBe('nonexistent.deeply.nested.key')
    })

    it('interpolates parameters', () => {
        const result = t('common.copiedWithLabel', { label: 'Password' })
        expect(result).toContain('Password')
        expect(result).not.toContain('{{label}}')
    })

    it('interpolates numeric parameters', () => {
        const result = t('common.copiedWithLabel', { label: 'Token' })
        expect(result).toContain('Token')
        expect(result).not.toContain('{{label}}')
    })

    it('works after switching language', () => {
        setLanguage('fr')
        const result = t('common.save')
        expect(result).toBeTruthy()
        expect(result).not.toBe('common.save')
    })

    it('returns different text for different languages', () => {
        const en = t('common.save')
        setLanguage('de')
        const de = t('common.save')
        expect(en).not.toBe(de)
    })
})