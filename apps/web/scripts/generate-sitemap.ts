import type { BlogPostFrontmatter, SitemapRoute } from '@/ts/Interfaces'

import fs from 'fs'
import path from 'path'
import matter from 'gray-matter'
import PATHS from '@/lib/paths'

const DIST = path.resolve(import.meta.dirname, '../dist')
const CONTENT = path.resolve(import.meta.dirname, '../content/posts')
const SITE_URL = 'https://clawhost.cloud'

const staticRoutes: SitemapRoute[] = [
    { path: PATHS.HOME, priority: '1.0', changefreq: 'weekly' },
    { path: `/${PATHS.GO}`, priority: '0.8', changefreq: 'monthly' },
    { path: `/${PATHS.COMPARE}`, priority: '0.7', changefreq: 'monthly' },
    { path: `/${PATHS.CHANGELOG}`, priority: '0.6', changefreq: 'weekly' },
    { path: `/${PATHS.AFFILIATE_PROGRAM}`, priority: '0.5', changefreq: 'monthly' },
    { path: `/${PATHS.TERMS}`, priority: '0.3', changefreq: 'yearly' },
    { path: `/${PATHS.PRIVACY}`, priority: '0.3', changefreq: 'yearly' }
]

const mdxFiles = fs.readdirSync(CONTENT).filter((f) => f.endsWith('.mdx'))

const postSlugs = mdxFiles.map((file) => {
    const raw = fs.readFileSync(path.join(CONTENT, file), 'utf-8')
    const { data } = matter(raw)
    return (data as BlogPostFrontmatter).slug
})

const today = new Date().toISOString().split('T')[0]

const urls = [
    ...staticRoutes.map((route) => ({
        loc: `${SITE_URL}${route.path}`,
        lastmod: today,
        priority: route.priority,
        changefreq: route.changefreq
    })),
    ...postSlugs.map((slug) => {
        const raw = fs.readFileSync(
            path.join(
                CONTENT,
                mdxFiles.find((f) => {
                    const { data } = matter(
                        fs.readFileSync(path.join(CONTENT, f), 'utf-8')
                    )
                    return (data as BlogPostFrontmatter).slug === slug
                })!
            ),
            'utf-8'
        )
        const { data } = matter(raw)
        return {
            loc: `${SITE_URL}/${slug}`,
            lastmod:
                (data as BlogPostFrontmatter).updatedAt ??
                (data as BlogPostFrontmatter).publishedAt,
            priority: '0.6',
            changefreq: 'monthly'
        }
    })
]

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
    .map(
        (url) => `  <url>
    <loc>${url.loc}</loc>
    <lastmod>${url.lastmod}</lastmod>
    <changefreq>${url.changefreq}</changefreq>
    <priority>${url.priority}</priority>
  </url>`
    )
    .join('\n')}
</urlset>`

fs.writeFileSync(path.join(DIST, 'sitemap.xml'), sitemap)
console.log(`Generated sitemap.xml with ${urls.length} URLs.`)