import type { TranslationKey, Languages, Translations } from './types'

import t from './t'
import setLanguage from './setLanguage'
import getLanguage from './getLanguage'
import en from './langs/en'
import he from './langs/he'

export type { TranslationKey, Languages, Translations }
export { t, setLanguage, getLanguage, en, he }