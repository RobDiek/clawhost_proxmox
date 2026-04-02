import { getLanguage } from '#i18n/index'
import { setLanguage } from '#i18n/index'

describe('getLanguage / setLanguage', () => {
    beforeEach(() => {
        setLanguage('en')
    })

    it('defaults to en', () => {
        expect(getLanguage()).toBe('en')
    })

    it('changes language', () => {
        setLanguage('fr')
        expect(getLanguage()).toBe('fr')
    })

    it('can switch between all supported languages', () => {
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
            expect(getLanguage()).toBe(lang)
        }
    })
})