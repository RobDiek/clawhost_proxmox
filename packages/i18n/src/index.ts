import type { TranslationKey, Languages, Translations } from '#i18n/types'

import t from '#i18n/t'
import setLanguage from '#i18n/setLanguage'
import getLanguage from '#i18n/getLanguage'
import loadLanguage from '#i18n/loadLanguage'
import en from '#i18n/langs/en'

export type { TranslationKey, Languages, Translations }
export { t, setLanguage, getLanguage, loadLanguage, en }