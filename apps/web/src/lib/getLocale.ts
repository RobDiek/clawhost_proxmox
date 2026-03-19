import type { Language } from '@/ts/Types'

import { getLanguage } from '@openclaw/i18n'
import { LANGUAGES } from '@/lib/constants'

const LOCALE_MAP: Record<Language, string> = {
    [LANGUAGES.EN]: 'en-US',
    [LANGUAGES.FR]: 'fr-FR',
    [LANGUAGES.ES]: 'es-ES',
    [LANGUAGES.DE]: 'de-DE',
    [LANGUAGES.ZH]: 'zh-CN',
    [LANGUAGES.HI]: 'hi-IN',
    [LANGUAGES.AR]: 'ar-SA',
    [LANGUAGES.RU]: 'ru-RU',
    [LANGUAGES.JA]: 'ja-JP',
    [LANGUAGES.TR]: 'tr-TR',
    [LANGUAGES.IT]: 'it-IT',
    [LANGUAGES.PL]: 'pl-PL',
    [LANGUAGES.NL]: 'nl-NL',
    [LANGUAGES.PT]: 'pt-BR'
}

const getLocale = (): string => LOCALE_MAP[getLanguage() as Language] || 'en-US'

export default getLocale