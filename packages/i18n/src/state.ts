import type { I18nState } from './types'

import en from './langs/en'
import fr from './langs/fr'
import es from './langs/es'
import de from './langs/de'
import zh from './langs/zh'
import hi from './langs/hi'
import ar from './langs/ar'
import ru from './langs/ru'
import ja from './langs/ja'
import tr from './langs/tr'
import it from './langs/it'
import pl from './langs/pl'
import nl from './langs/nl'
import pt from './langs/pt'

const state: I18nState = {
    languages: { en, fr, es, de, zh, hi, ar, ru, ja, tr, it, pl, nl, pt },
    currentLanguage: 'en'
}

export default state