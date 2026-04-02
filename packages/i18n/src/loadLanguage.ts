import type { Languages, Translations } from '#i18n/types'

import state from '#i18n/state'

const loaders: Record<Languages, () => Promise<{ default: Translations }>> = {
    en: () => Promise.resolve({ default: state.languages.en }),
    fr: () => import('#i18n/langs/fr'),
    es: () => import('#i18n/langs/es'),
    de: () => import('#i18n/langs/de'),
    zh: () => import('#i18n/langs/zh'),
    hi: () => import('#i18n/langs/hi'),
    ar: () => import('#i18n/langs/ar'),
    ru: () => import('#i18n/langs/ru'),
    ja: () => import('#i18n/langs/ja'),
    tr: () => import('#i18n/langs/tr'),
    it: () => import('#i18n/langs/it'),
    pl: () => import('#i18n/langs/pl'),
    nl: () => import('#i18n/langs/nl'),
    pt: () => import('#i18n/langs/pt')
}

const loadingPromises = new Map<Languages, Promise<void>>()

async function loadLanguage(lang: Languages): Promise<void> {
    if (state.languages[lang]) return

    const existing = loadingPromises.get(lang)
    if (existing) return existing

    const promise = loaders[lang]().then((mod) => {
        state.languages[lang] = mod.default
        loadingPromises.delete(lang)
    })

    loadingPromises.set(lang, promise)
    return promise
}

export default loadLanguage