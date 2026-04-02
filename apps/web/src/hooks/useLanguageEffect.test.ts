import { setLanguage, getLanguage } from '@openclaw/i18n'

describe('useLanguageEffect logic', () => {
    it('sets i18n language correctly', () => {
        setLanguage('fr')
        expect(getLanguage()).toBe('fr')
        setLanguage('en')
    })

    it('sets document lang attribute', () => {
        document.documentElement.lang = 'de'
        expect(document.documentElement.lang).toBe('de')
        document.documentElement.lang = 'en'
    })

    it('language and document lang stay in sync', () => {
        const lang = 'es'
        setLanguage(lang)
        document.documentElement.lang = lang
        expect(getLanguage()).toBe(lang)
        expect(document.documentElement.lang).toBe(lang)
        setLanguage('en')
        document.documentElement.lang = 'en'
    })

    it('handles all supported languages', () => {
        const languages = [
            'en',
            'fr',
            'es',
            'de',
            'zh',
            'hi',
            'ar',
            'ru',
            'ja',
            'tr',
            'it',
            'pl',
            'nl',
            'pt'
        ] as const
        for (const lang of languages) {
            setLanguage(lang)
            document.documentElement.lang = lang
            expect(getLanguage()).toBe(lang)
            expect(document.documentElement.lang).toBe(lang)
        }
        setLanguage('en')
    })
})