import type { I18nState } from './types'

import en from './langs/en'
import fr from './langs/fr'
import es from './langs/es'
import de from './langs/de'
import he from './langs/he'

const state: I18nState = {
    languages: { en, fr, es, de, he },
    currentLanguage: 'he'
}

export default state