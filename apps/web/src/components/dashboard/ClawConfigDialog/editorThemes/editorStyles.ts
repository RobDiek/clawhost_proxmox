import { EditorView } from '@uiw/react-codemirror'

const editorStyles = EditorView.theme({
    '&': { fontSize: '12px', height: '100%' },
    '.cm-scroller': { overflow: 'auto' },
    '.cm-gutters': { borderRight: 'none' }
})

export default editorStyles