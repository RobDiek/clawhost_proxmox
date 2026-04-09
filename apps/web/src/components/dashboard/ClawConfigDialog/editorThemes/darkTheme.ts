import { createTheme } from '@uiw/codemirror-themes'
import { tags } from '@lezer/highlight'

const darkTheme = createTheme({
    theme: 'dark',
    settings: {
        background: '#000000',
        foreground: '#d4d4d8',
        caret: '#d4d4d8',
        selection: '#264f78',
        selectionMatch: '#264f7844',
        lineHighlight: '#ffffff08',
        gutterBackground: '#000000',
        gutterForeground: '#525252'
    },
    styles: [
        { tag: tags.propertyName, color: '#93c5fd' },
        { tag: tags.string, color: '#86efac' },
        { tag: tags.number, color: '#fde68a' },
        { tag: tags.bool, color: '#f9a8d4' },
        { tag: tags.null, color: '#a78bfa' },
        { tag: tags.punctuation, color: '#a1a1aa' },
        { tag: tags.keyword, color: '#c084fc' },
        { tag: tags.function(tags.variableName), color: '#67e8f9' },
        { tag: tags.comment, color: '#6b7280' },
        { tag: tags.operator, color: '#f9a8d4' },
        { tag: tags.heading, color: '#93c5fd', fontWeight: 'bold' },
        { tag: tags.emphasis, color: '#d4d4d8', fontStyle: 'italic' },
        { tag: tags.strong, color: '#d4d4d8', fontWeight: 'bold' },
        { tag: tags.link, color: '#67e8f9' },
        { tag: tags.url, color: '#86efac' }
    ]
})

export default darkTheme