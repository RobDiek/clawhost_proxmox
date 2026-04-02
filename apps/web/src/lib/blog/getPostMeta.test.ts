vi.mock('@/lib/blog/data', () => ({
    default: [
        [
            '/content/posts/test.mdx',
            {
                frontmatter: {
                    slug: 'test-post',
                    title: 'Test Post',
                    description: 'A test post description',
                    publishedAt: '2024-06-01'
                },
                default: () => null
            }
        ]
    ]
}))

import { getPostMeta } from '@/lib/blog'

describe('getPostMeta', () => {
    it('returns post meta for existing slug', () => {
        const meta = getPostMeta('test-post')
        expect(meta).not.toBeNull()
        expect(meta!.title).toBe('Test Post')
        expect(meta!.slug).toBe('test-post')
    })

    it('returns null for non-existent slug', () => {
        expect(getPostMeta('does-not-exist')).toBeNull()
    })

    it('includes readingTime', () => {
        const meta = getPostMeta('test-post')
        expect(meta!.readingTime).toBeGreaterThanOrEqual(1)
    })
})