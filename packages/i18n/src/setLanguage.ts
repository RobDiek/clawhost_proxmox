import type { Languages } from '#i18n/types'

import state from '#i18n/state'

function setLanguage(lang: Languages): void {
    state.currentLanguage = lang
}

export default setLanguage