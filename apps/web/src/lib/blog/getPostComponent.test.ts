vi.mock('@/lib/blog/data', () => ({
    default: [
        [
            '/content/posts/test.mdx',
            {
                slug: 'test-post',
                title: 'Test Post',
                description: 'desc',
                publishedAt: '2024-06-01'
            }
        ]
    ]
}))

vi.mock('@/lib/blog/componentLoaders', () => {
    const Component = () => null
    return {
        default: {
            '/content/posts/test.mdx': () =>
                Promise.resolve({ default: Component })
        }
    }
})

import { getPostComponent } from '@/lib/blog'

describe('getPostComponent', () => {
    it('returns lazy component for existing slug', () => {
        const component = getPostComponent('test-post')
        expect(component).not.toBeNull()
    })

    it('returns null for non-existent slug', () => {
        expect(getPostComponent('no-such-post')).toBeNull()
    })
})