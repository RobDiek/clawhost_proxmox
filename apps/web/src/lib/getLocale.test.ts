import { setLanguage } from '@openclaw/i18n'
import { getLocale } from '@/lib'

describe('getLocale', () => {
    beforeEach(() => {
        setLanguage('en')
    })

    it('returns en-US for English', () => {
        expect(getLocale()).toBe('en-US')
    })

    it('returns fr-FR for French', () => {
        setLanguage('fr')
        expect(getLocale()).toBe('fr-FR')
    })

    it('returns es-ES for Spanish', () => {
        setLanguage('es')
        expect(getLocale()).toBe('es-ES')
    })

    it('returns de-DE for German', () => {
        setLanguage('de')
        expect(getLocale()).toBe('de-DE')
    })

    it('returns zh-CN for Chinese', () => {
        setLanguage('zh')
        expect(getLocale()).toBe('zh-CN')
    })

    it('returns ar-SA for Arabic', () => {
        setLanguage('ar')
        expect(getLocale()).toBe('ar-SA')
    })

    it('returns ja-JP for Japanese', () => {
        setLanguage('ja')
        expect(getLocale()).toBe('ja-JP')
    })

    it('returns pt-BR for Portuguese', () => {
        setLanguage('pt')
        expect(getLocale()).toBe('pt-BR')
    })
})