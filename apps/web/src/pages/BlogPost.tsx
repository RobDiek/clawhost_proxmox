import type { FC, ReactNode } from 'react'

import { Suspense } from 'react'
import { useParams, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { t } from '@openclaw/i18n'
import { externalUrls } from '@openclaw/shared'
import {
    ArrowLeftIcon,
    CalendarBlankIcon,
    ClockIcon
} from '@phosphor-icons/react'
import {
    BlogCTA,
    Header,
    LandingFooter,
    PageBackground,
    PageTitle,
    JsonLd
} from '@/components'
import { getPostComponent, getPostMeta } from '@/lib/blog'
import { PATHS, ROUTES, getBaseDomain, getLocale } from '@/lib'
import NotFound from '@/pages/NotFound'

const SITE_URL = `https://${getBaseDomain()}`

const BlogPost: FC = (): ReactNode => {
    const { slug } = useParams<Record<string, string>>()

    const meta = slug ? getPostMeta(slug) : null
    const Content = slug ? getPostComponent(slug) : null

    if (!meta || !Content) return <NotFound />

    const formattedDate = new Date(meta.publishedAt).toLocaleDateString(
        getLocale(),
        {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        }
    )

    const postUrl = `${SITE_URL}/${PATHS.BLOG}/${meta.slug}`
    const imageUrl = `${SITE_URL}/og/${meta.slug}.png`

    return (
        <div className='bg-background text-foreground relative flex min-h-screen flex-col'>
            <PageTitle
                title={meta.title}
                description={meta.description}
                image={imageUrl}
                url={postUrl}
                type='article'
                keywords={meta.tags}
                publishedAt={meta.publishedAt}
                modifiedAt={meta.updatedAt}
                author={meta.author}
            />
            <JsonLd
                data={{
                    '@context': 'https://schema.org',
                    '@type': 'BreadcrumbList',
                    itemListElement: [
                        {
                            '@type': 'ListItem',
                            position: 1,
                            name: t('blog.title'),
                            item: `${SITE_URL}/${PATHS.BLOG}`
                        },
                        {
                            '@type': 'ListItem',
                            position: 2,
                            name: meta.title,
                            item: postUrl
                        }
                    ]
                }}
            />
            <JsonLd
                data={{
                    '@context': 'https://schema.org',
                    '@type': 'BlogPosting',
                    headline: meta.title,
                    description: meta.description,
                    image: imageUrl,
                    author: { '@type': 'Organization', name: meta.author },
                    datePublished: meta.publishedAt,
                    ...(meta.updatedAt && { dateModified: meta.updatedAt }),
                    url: postUrl,
                    publisher: {
                        '@type': 'Organization',
                        name: 'ClawHost',
                        logo: {
                            '@type': 'ImageObject',
                            url: `${externalUrls.CLAWHOST.CDN_GENERALS}/clawhost-logo-light.png`
                        }
                    },
                    mainEntityOfPage: {
                        '@type': 'WebPage',
                        '@id': postUrl
                    },
                    keywords: meta.tags.join(', ')
                }}
            />
            <PageBackground />
            <Header />

            <motion.main
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className='relative mx-auto w-full max-w-6xl flex-1 px-6 py-12'
            >
                <Link
                    to={ROUTES.BLOG}
                    className='text-muted-foreground hover:text-foreground mb-8 inline-flex items-center gap-1.5 text-sm transition'
                >
                    <ArrowLeftIcon className='h-4 w-4' />
                    {t('blog.backToBlog')}
                </Link>

                <article>
                    <h1 className='font-clash mb-4 text-4xl font-bold'>
                        {meta.title}
                    </h1>

                    <div className='text-muted-foreground mb-8 flex items-center gap-4 text-sm'>
                        <time
                            dateTime={meta.publishedAt}
                            className='flex items-center gap-1.5'
                        >
                            <CalendarBlankIcon className='h-4 w-4' />
                            {formattedDate}
                        </time>
                        <span className='flex items-center gap-1.5'>
                            <ClockIcon className='h-4 w-4' />
                            {t('blog.readingTime', {
                                minutes: String(meta.readingTime)
                            })}
                        </span>
                    </div>

                    <Suspense
                        fallback={
                            <div className='bg-foreground/5 h-96 animate-pulse rounded-lg' />
                        }
                    >
                        <div className='prose dark:prose-invert prose-sm prose-headings:font-clash prose-headings:font-semibold prose-h1:hidden prose-a:text-primary prose-a:no-underline hover:prose-a:underline max-w-none'>
                            <Content />
                        </div>
                    </Suspense>
                </article>

                <BlogCTA />
            </motion.main>

            <LandingFooter />
        </div>
    )
}

export default BlogPost