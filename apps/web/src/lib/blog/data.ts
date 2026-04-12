import type { BlogPostFrontmatter } from '@/ts/Interfaces'

const frontmatterModules = import.meta.glob<BlogPostFrontmatter>(
    '../../../content/posts/*.mdx',
    {
        eager: true,
        import: 'frontmatter'
    }
)

const moduleEntries: [string, BlogPostFrontmatter][] =
    Object.entries(frontmatterModules)

export default moduleEntries