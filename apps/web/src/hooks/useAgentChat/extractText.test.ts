import extractText from '@/hooks/useAgentChat/extractText'

describe('extractText', () => {
    it('returns string content as-is', () => {
        expect(extractText('hello world')).toBe('hello world')
    })

    it('returns empty string for null', () => {
        expect(extractText(null)).toBe('')
    })

    it('returns empty string for undefined', () => {
        expect(extractText(undefined)).toBe('')
    })

    it('returns empty string for number', () => {
        expect(extractText(42)).toBe('')
    })

    it('extracts text from array of content blocks', () => {
        const content = [
            { type: 'text', text: 'Hello' },
            { type: 'image', url: 'http://img.png' },
            { type: 'text', text: 'World' }
        ]
        expect(extractText(content)).toBe('Hello\nWorld')
    })

    it('returns empty string for empty array', () => {
        expect(extractText([])).toBe('')
    })

    it('extracts from object with content string', () => {
        expect(extractText({ content: 'nested text' })).toBe('nested text')
    })

    it('extracts from object with content array', () => {
        const obj = { content: [{ type: 'text', text: 'from array' }] }
        expect(extractText(obj)).toBe('from array')
    })

    it('extracts from object with text field', () => {
        expect(extractText({ text: 'direct text' })).toBe('direct text')
    })

    it('extracts from OpenAI-style choices array', () => {
        const obj = {
            choices: [{ message: { content: 'from choices' } }]
        }
        expect(extractText(obj)).toBe('from choices')
    })

    it('extracts from delta in choices', () => {
        const obj = {
            choices: [{ delta: { content: 'streaming text' } }]
        }
        expect(extractText(obj)).toBe('streaming text')
    })

    it('returns empty string for object with no recognizable fields', () => {
        expect(extractText({ random: 'field' })).toBe('')
    })
})