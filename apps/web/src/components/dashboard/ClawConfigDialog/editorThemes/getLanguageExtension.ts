import type { ClawFileType } from '@/ts/Types'
import type { Extension } from '@codemirror/state'

import { json } from '@codemirror/lang-json'
import { javascript } from '@codemirror/lang-javascript'
import { markdown } from '@codemirror/lang-markdown'
import { yaml } from '@codemirror/lang-yaml'

const getLanguageExtension = (fileType: ClawFileType): Extension | null => {
    if (fileType === 'json') return json()
    if (fileType === 'javascript') return javascript()
    if (fileType === 'typescript') return javascript({ typescript: true })
    if (fileType === 'markdown') return markdown()
    if (fileType === 'yaml') return yaml()
    return null
}

export default getLanguageExtension