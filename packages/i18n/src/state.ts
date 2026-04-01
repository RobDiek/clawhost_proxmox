import type { I18nState, Languages, Translations } from '#i18n/types'

import en from '#i18n/langs/en'

const state: I18nState = {
    languages: { en } as Record<Languages, Translations>,
    currentLanguage: 'en'
}

export default state