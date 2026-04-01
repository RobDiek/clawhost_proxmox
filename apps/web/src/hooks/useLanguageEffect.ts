import type { Language } from '@/ts/Types'

import { useEffect, useState } from 'react'
import { setLanguage, loadLanguage } from '@openclaw/i18n'
import { usePreferencesStore } from '@/lib/store'

const useLanguageEffect = (): Language => {
    const language = usePreferencesStore((s) => s.language)
    const [, forceUpdate] = useState(0)

    useEffect(() => {
        loadLanguage(language).then(() => {
            setLanguage(language)
            document.documentElement.lang = language
            forceUpdate((n) => n + 1)
        })
    }, [language])

    return language
}

export default useLanguageEffect