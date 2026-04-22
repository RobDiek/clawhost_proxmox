import type { Extension } from '@codemirror/state'

import { languages } from '@codemirror/language-data'
import { LanguageDescription } from '@codemirror/language'

const cache = new Map<string, Extension | null>()

const getLanguageExtension = async (
    filename: string
): Promise<Extension | null> => {
    if (cache.has(filename)) return cache.get(filename)!
    const desc = LanguageDescription.matchFilename(languages, filename)
    if (!desc) {
        cache.set(filename, null)
        return null
    }
    const support = await desc.load()
    cache.set(filename, support)
    return support
}

export default getLanguageExtension