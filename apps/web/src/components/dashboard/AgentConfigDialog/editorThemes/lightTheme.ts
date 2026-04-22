import { createTheme } from '@uiw/codemirror-themes'
import { tags } from '@lezer/highlight'

const lightTheme = createTheme({
    theme: 'light',
    settings: {
        background: '#fafafa',
        foreground: '#18181b',
        caret: '#18181b',
        selection: '#c7d2fe',
        selectionMatch: '#c7d2fe66',
        lineHighlight: '#00000008',
        gutterBackground: '#fafafa',
        gutterForeground: '#a1a1aa'
    },
    styles: [
        { tag: tags.propertyName, color: '#2563eb' },
        { tag: tags.string, color: '#16a34a' },
        { tag: tags.number, color: '#d97706' },
        { tag: tags.bool, color: '#db2777' },
        { tag: tags.null, color: '#7c3aed' },
        { tag: tags.punctuation, color: '#71717a' },
        { tag: tags.keyword, color: '#7c3aed' },
        { tag: tags.function(tags.variableName), color: '#0891b2' },
        { tag: tags.comment, color: '#9ca3af' },
        { tag: tags.operator, color: '#db2777' },
        { tag: tags.heading, color: '#2563eb', fontWeight: 'bold' },
        { tag: tags.emphasis, color: '#18181b', fontStyle: 'italic' },
        { tag: tags.strong, color: '#18181b', fontWeight: 'bold' },
        { tag: tags.link, color: '#0891b2' },
        { tag: tags.url, color: '#16a34a' }
    ]
})

export default lightTheme