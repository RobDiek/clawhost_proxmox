import type { BlogPostFrontmatter, PrerenderMeta } from '@/ts/Interfaces'

import fs from 'fs'
import path from 'path'
import matter from 'gray-matter'
import PATHS from '@/lib/paths'

const DIST = path.resolve(import.meta.dirname, '../dist')
const CONTENT = path.resolve(import.meta.dirname, '../content/posts')
const SITE_URL = 'https://clawhost.cloud'

const template = fs.readFileSync(path.join(DIST, 'index.html'), 'utf-8')

const mdxFiles = fs.readdirSync(CONTENT).filter((f) => f.endsWith('.mdx'))

const posts: BlogPostFrontmatter[] = mdxFiles.map((file) => {
    const raw = fs.readFileSync(path.join(CONTENT, file), 'utf-8')
    const { data } = matter(raw)
    return data as BlogPostFrontmatter
})

function escapeHtml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
}

function injectMeta(html: string, meta: PrerenderMeta): string {
    const fullTitle = `${meta.title} - ClawHost`

    html = html.replace(
        /<title>.*?<\/title>/,
        `<title>${escapeHtml(fullTitle)}</title>`
    )

    html = html.replace(
        /<meta\s+name="description"[^>]*\/>/,
        `<meta name="description" content="${escapeHtml(meta.description)}" />`
    )
    html = html.replace(
        /<meta\s+property="og:type"[^>]*\/>/,
        `<meta property="og:type" content="${meta.type}" />`
    )
    html = html.replace(
        /<meta\s+property="og:title"[^>]*\/>/,
        `<meta property="og:title" content="${escapeHtml(fullTitle)}" />`
    )
    html = html.replace(
        /<meta\s+property="og:description"[^>]*\/>/,
        `<meta property="og:description" content="${escapeHtml(meta.description)}" />`
    )
    html = html.replace(
        /<meta\s+property="og:image"[^>]*\/>/,
        `<meta property="og:image" content="${meta.image}" />`
    )
    html = html.replace(
        /<meta\s+property="og:url"[^>]*\/>/,
        `<meta property="og:url" content="${meta.url}" />`
    )
    html = html.replace(
        /<meta\s+name="twitter:title"[^>]*\/>/,
        `<meta name="twitter:title" content="${escapeHtml(fullTitle)}" />`
    )
    html = html.replace(
        /<meta\s+name="twitter:description"[^>]*\/>/,
        `<meta name="twitter:description" content="${escapeHtml(meta.description)}" />`
    )
    html = html.replace(
        /<meta\s+name="twitter:image"[^>]*\/>/,
        `<meta name="twitter:image" content="${meta.image}" />`
    )

    let extraTags = `
    <link rel="canonical" href="${meta.url}" />`

    if (meta.articleMeta) {
        extraTags += `
    <meta property="article:published_time" content="${meta.articleMeta.publishedTime}" />`
        if (meta.articleMeta.modifiedTime) {
            extraTags += `
    <meta property="article:modified_time" content="${meta.articleMeta.modifiedTime}" />`
        }
        extraTags += `
    <meta property="article:author" content="${escapeHtml(meta.articleMeta.author)}" />`
        for (const tag of meta.articleMeta.tags) {
            extraTags += `
    <meta property="article:tag" content="${escapeHtml(tag)}" />`
        }
    }

    if (meta.jsonLd) {
        extraTags += `
    <script type="application/ld+json">${JSON.stringify(meta.jsonLd)}</script>`
    }

    extraTags += '\n  '

    html = html.replace('</head>', `${extraTags}</head>`)

    return html
}

function writePrerenderedPage(routePath: string, html: string) {
    if (routePath === '/') {
        fs.writeFileSync(path.join(DIST, 'index.html'), html)
        return
    }
    const dir = path.join(DIST, routePath)
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'index.html'), html)
}

const staticPages: { path: string; meta: PrerenderMeta }[] = [
    {
        path: '/',
        meta: {
            title: 'Deploy OpenClaw. One click. Done.',
            description:
                'Deploy OpenClaw on your own VPS with one click. Self-hostable cloud hosting with full root access, global locations, and transparent pricing.',
            url: SITE_URL,
            type: 'website',
            image: `${SITE_URL}/og-image.webp`,
            jsonLd: {
                '@context': 'https://schema.org',
                '@type': 'WebSite',
                name: 'ClawHost',
                url: SITE_URL
            }
        }
    },
    {
        path: PATHS.CHANGELOG,
        meta: {
            title: 'Changelog',
            description:
                'Track updates, new features, and improvements to ClawHost.',
            url: `${SITE_URL}/${PATHS.CHANGELOG}`,
            type: 'website',
            image: `${SITE_URL}/og-image.webp`
        }
    },
    {
        path: PATHS.COMPARE,
        meta: {
            title: 'Full Comparison',
            description:
                'See how ClawHost compares to other OpenClaw hosting platforms.',
            url: `${SITE_URL}/${PATHS.COMPARE}`,
            type: 'website',
            image: `${SITE_URL}/og-image.webp`
        }
    },
    {
        path: PATHS.GO,
        meta: {
            title: 'ClawHost Go',
            description:
                'A lightweight desktop client to manage your OpenClaw instances. Deploy, monitor, and control your claws — right from your machine.',
            url: `${SITE_URL}/${PATHS.GO}`,
            type: 'website',
            image: `${SITE_URL}/og-go.webp`
        }
    },
    {
        path: PATHS.HERMES,
        meta: {
            title: 'Deploy Hermes Agent',
            description:
                'Deploy Hermes Agent on your own VPS with one click. Full root access, global locations, and transparent pricing.',
            url: `${SITE_URL}/${PATHS.HERMES}`,
            type: 'website',
            image: `${SITE_URL}/og-image.webp`,
            jsonLd: {
                '@context': 'https://schema.org',
                '@type': 'WebPage',
                name: 'Deploy Hermes Agent',
                url: `${SITE_URL}/${PATHS.HERMES}`,
                description: 'Deploy Hermes Agent on your own VPS with one click.',
                publisher: {
                    '@type': 'Organization',
                    name: 'ClawHost',
                    url: SITE_URL
                }
            }
        }
    },
    {
        path: PATHS.HERMES_GO,
        meta: {
            title: 'ClawHost Go - Hermes Agent',
            description:
                'A lightweight desktop client to deploy Hermes Agent locally. Deploy, monitor, and control your agents — right from your machine.',
            url: `${SITE_URL}/${PATHS.HERMES_GO}`,
            type: 'website',
            image: `${SITE_URL}/og-image.webp`,
            jsonLd: {
                '@context': 'https://schema.org',
                '@type': 'WebPage',
                name: 'ClawHost Go - Hermes Agent',
                url: `${SITE_URL}/${PATHS.HERMES_GO}`,
                description: 'Deploy Hermes Agent locally with a lightweight desktop client.',
                publisher: {
                    '@type': 'Organization',
                    name: 'ClawHost',
                    url: SITE_URL
                }
            }
        }
    },
    {
        path: PATHS.TERMS,
        meta: {
            title: 'Terms of Service',
            description:
                'Read the terms and conditions for using ClawHost services.',
            url: `${SITE_URL}/${PATHS.TERMS}`,
            type: 'website',
            image: `${SITE_URL}/og-image.webp`
        }
    },
    {
        path: PATHS.PRIVACY,
        meta: {
            title: 'Privacy Policy',
            description:
                'Learn how ClawHost collects, uses, and protects your personal data.',
            url: `${SITE_URL}/${PATHS.PRIVACY}`,
            type: 'website',
            image: `${SITE_URL}/og-image.webp`
        }
    }
]

for (const page of staticPages) {
    const html = injectMeta(template, page.meta)
    writePrerenderedPage(page.path, html)
}

for (const post of posts) {
    const imageUrl = post.coverImage
        ? `${SITE_URL}${post.coverImage}`
        : `${SITE_URL}/og-image.webp`

    const postHtml = injectMeta(template, {
        title: post.title,
        description: post.description,
        url: `${SITE_URL}/${post.slug}`,
        type: 'article',
        image: imageUrl,
        articleMeta: {
            publishedTime: post.publishedAt,
            modifiedTime: post.updatedAt,
            author: post.author,
            tags: post.tags
        },
        jsonLd: {
            '@context': 'https://schema.org',
            '@type': 'BlogPosting',
            headline: post.title,
            description: post.description,
            image: imageUrl,
            author: { '@type': 'Organization', name: post.author },
            datePublished: post.publishedAt,
            ...(post.updatedAt && { dateModified: post.updatedAt }),
            url: `${SITE_URL}/${post.slug}`,
            publisher: {
                '@type': 'Organization',
                name: 'ClawHost',
                logo: { '@type': 'ImageObject', url: `${SITE_URL}/favicon.ico` }
            },
            mainEntityOfPage: {
                '@type': 'WebPage',
                '@id': `${SITE_URL}/${post.slug}`
            },
            keywords: post.tags.join(', ')
        }
    })

    const dir = path.join(DIST, post.slug)
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'index.html'), postHtml)
}

console.log(
    `Pre-rendered ${staticPages.length} static pages and ${posts.length} blog posts.`
)