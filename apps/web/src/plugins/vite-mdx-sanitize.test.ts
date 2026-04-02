import viteMdxSanitize from '@/plugins/vite-mdx-sanitize'

describe('viteMdxSanitize', () => {
    const plugin = viteMdxSanitize()
    const transform = (code: string, id: string) => {
        const result = (
            plugin.transform as (
                code: string,
                id: string
            ) => { code: string; map: null } | null
        )(code, id)
        return result?.code ?? null
    }

    it('returns null for non-mdx files', () => {
        expect(transform('content', 'file.ts')).toBeNull()
        expect(transform('content', 'file.tsx')).toBeNull()
        expect(transform('content', 'file.md')).toBeNull()
    })

    it('processes .mdx files', () => {
        const result = transform('Hello world', 'post.mdx')
        expect(result).toBe('Hello world')
    })

    it('escapes curly braces in prose', () => {
        const result = transform('Use {variable} here', 'post.mdx')
        expect(result).toContain('&#123;')
        expect(result).toContain('&#125;')
    })

    it('does not escape curly braces inside code blocks', () => {
        const code = '```\nconst x = {foo: 1}\n```'
        const result = transform(code, 'post.mdx')
        expect(result).toContain('{foo: 1}')
    })

    it('does not escape curly braces inside inline code', () => {
        const code = 'Use `{variable}` in your code'
        const result = transform(code, 'post.mdx')
        expect(result).toContain('`{variable}`')
    })

    it('escapes angle brackets that are not HTML tags', () => {
        const result = transform('if x < 5 then do', 'post.mdx')
        expect(result).toContain('&lt;')
    })

    it('preserves HTML tags', () => {
        const result = transform('<div>hello</div>', 'post.mdx')
        expect(result).toContain('<div>')
    })

    it('sanitizes frontmatter unicode characters', () => {
        const mdx = '---\ntitle: "Smart quotes"\n---\nBody text'
        const result = transform(mdx, 'post.mdx')
        expect(result).toContain('title:')
        expect(result).not.toContain('\u201C')
        expect(result).not.toContain('\u201D')
    })

    it('replaces em dash in frontmatter', () => {
        const mdx = '---\ntitle: test \u2014 value\n---\nBody'
        const result = transform(mdx, 'post.mdx')
        expect(result).not.toContain('\u2014')
    })

    it('handles mdx files with query strings', () => {
        const result = transform('content', 'post.mdx?import')
        expect(result).toBe('content')
    })
})