vi.mock('@/lib/blog/data', () => ({
    default: [
        [
            '/content/posts/first.mdx',
            {
                frontmatter: {
                    slug: 'first-post',
                    title: 'First Post',
                    description:
                        'A short description for the first blog post about testing',
                    publishedAt: '2024-06-01'
                },
                default: () => null
            }
        ],
        [
            '/content/posts/second.mdx',
            {
                frontmatter: {
                    slug: 'second-post',
                    title: 'Second Post',
                    description:
                        'Another post with a much longer description that should result in a higher reading time estimate because it has many more words in the description field',
                    publishedAt: '2024-07-15'
                },
                default: () => null
            }
        ],
        [
            '/content/posts/third.mdx',
            {
                frontmatter: {
                    slug: 'third-post',
                    title: 'Third Post',
                    description: 'Mid-range post',
                    publishedAt: '2024-05-20'
                },
                default: () => null
            }
        ]
    ]
}))

import { allPosts } from '@/lib/blog'

describe('allPosts', () => {
    it('is a non-empty array', () => {
        expect(allPosts.length).toBeGreaterThan(0)
    })

    it('is sorted by publishedAt descending (newest first)', () => {
        for (let i = 1; i < allPosts.length; i++) {
            const prev = new Date(allPosts[i - 1].publishedAt).getTime()
            const curr = new Date(allPosts[i].publishedAt).getTime()
            expect(prev).toBeGreaterThanOrEqual(curr)
        }
    })

    it('includes readingTime for each post', () => {
        for (const post of allPosts) {
            expect(post.readingTime).toBeGreaterThanOrEqual(1)
            expect(typeof post.readingTime).toBe('number')
        }
    })

    it('preserves frontmatter fields', () => {
        const first = allPosts.find((p) => p.slug === 'first-post')
        expect(first).toBeDefined()
        expect(first!.title).toBe('First Post')
    })

    it('newest post is first', () => {
        expect(allPosts[0].slug).toBe('second-post')
    })
})