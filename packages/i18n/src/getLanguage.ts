import type { Languages } from '#i18n/types'

import state from '#i18n/state'

function getLanguage(): Languages {
    return state.currentLanguage
}

export default getLanguage