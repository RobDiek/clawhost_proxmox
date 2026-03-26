vi.mock('@/lib/blog/data', () => {
    const Component = () => null
    return {
        default: [
            [
                '/content/posts/test.mdx',
                {
                    frontmatter: {
                        slug: 'test-post',
                        title: 'Test Post',
                        description: 'desc',
                        publishedAt: '2024-06-01'
                    },
                    default: Component
                }
            ]
        ]
    }
})

import { getPostComponent } from '@/lib/blog'

describe('getPostComponent', () => {
    it('returns component for existing slug', () => {
        const component = getPostComponent('test-post')
        expect(component).not.toBeNull()
        expect(typeof component).toBe('function')
    })

    it('returns null for non-existent slug', () => {
        expect(getPostComponent('no-such-post')).toBeNull()
    })
})