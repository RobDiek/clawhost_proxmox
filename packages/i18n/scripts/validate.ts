import en from '../src/langs/en'
import fr from '../src/langs/fr'
import es from '../src/langs/es'
import de from '../src/langs/de'
import zh from '../src/langs/zh'
import hi from '../src/langs/hi'
import ar from '../src/langs/ar'
import ru from '../src/langs/ru'
import ja from '../src/langs/ja'
import tr from '../src/langs/tr'
import it from '../src/langs/it'
import pl from '../src/langs/pl'
import nl from '../src/langs/nl'
import pt from '../src/langs/pt'

const languages: Record<string, Record<string, unknown>> = {
    en,
    fr,
    es,
    de,
    zh,
    hi,
    ar,
    ru,
    ja,
    tr,
    it,
    pl,
    nl,
    pt
}

const getKeys = (obj: Record<string, unknown>, prefix = ''): string[] => {
    const keys: string[] = []
    for (const key of Object.keys(obj)) {
        const fullKey = prefix ? `${prefix}.${key}` : key
        const value = obj[key]
        if (
            typeof value === 'object' &&
            value !== null &&
            !Array.isArray(value)
        ) {
            keys.push(...getKeys(value as Record<string, unknown>, fullKey))
        } else {
            keys.push(fullKey)
        }
    }
    return keys
}

const enKeys = new Set(getKeys(languages.en))
let hasErrors = false

for (const [lang, translations] of Object.entries(languages)) {
    if (lang === 'en') continue

    const langKeys = new Set(getKeys(translations))

    const missing = [...enKeys].filter((k) => !langKeys.has(k))
    const extra = [...langKeys].filter((k) => !enKeys.has(k))

    if (missing.length > 0) {
        hasErrors = true
        console.error(
            `\n❌ ${lang.toUpperCase()} is missing ${missing.length} key(s):`
        )
        for (const key of missing) {
            console.error(`   - ${key}`)
        }
    }

    if (extra.length > 0) {
        hasErrors = true
        console.error(
            `\n⚠️  ${lang.toUpperCase()} has ${extra.length} extra key(s):`
        )
        for (const key of extra) {
            console.error(`   - ${key}`)
        }
    }
}

if (hasErrors) {
    console.error(
        '\n🚫 i18n validation failed! All language files must have the same keys as en.ts\n'
    )
    process.exit(1)
} else {
    console.log('✅ All 14 language files have matching keys.')
}