import type { FC, ReactNode } from 'react'
import type { PageTitleProps } from '@/ts/Interfaces'

import { useEffect } from 'react'
import { t } from '@openclaw/i18n'

const setMetaTag = (attr: string, key: string, content: string) => {
    let meta = document.querySelector(
        `meta[${attr}="${key}"]`
    ) as HTMLMetaElement | null
    if (!meta) {
        meta = document.createElement('meta')
        meta.setAttribute(attr, key)
        document.head.appendChild(meta)
    }
    meta.content = content
}

const setLinkTag = (rel: string, href: string) => {
    let link = document.querySelector(
        `link[rel="${rel}"]`
    ) as HTMLLinkElement | null
    if (!link) {
        link = document.createElement('link')
        link.rel = rel
        document.head.appendChild(link)
    }
    link.href = href
}

const PageTitle: FC<PageTitleProps> = ({
    title,
    description,
    image,
    url,
    type,
    noIndex,
    keywords,
    publishedAt,
    modifiedAt,
    author
}): ReactNode => {
    useEffect(() => {
        const fullTitle = `${title} - ${t('common.brandName')}`
        document.title = fullTitle
        setMetaTag('property', 'og:title', fullTitle)
        setMetaTag('name', 'twitter:title', fullTitle)
    }, [title])

    useEffect(() => {
        if (description) {
            setMetaTag('name', 'description', description)
            setMetaTag('property', 'og:description', description)
            setMetaTag('name', 'twitter:description', description)
        }
    }, [description])

    useEffect(() => {
        if (image) {
            setMetaTag('property', 'og:image', image)
            setMetaTag('name', 'twitter:image', image)
        }
    }, [image])

    useEffect(() => {
        if (url) {
            setMetaTag('property', 'og:url', url)
            setLinkTag('canonical', url)
        }
    }, [url])

    useEffect(() => {
        if (type) {
            setMetaTag('property', 'og:type', type)
        }
    }, [type])

    useEffect(() => {
        if (keywords && keywords.length > 0) {
            setMetaTag('name', 'keywords', keywords.join(', '))
            if (type === 'article') {
                document
                    .querySelectorAll('meta[property="article:tag"]')
                    .forEach((el) => el.remove())
                keywords.forEach((tag) => {
                    const meta = document.createElement('meta')
                    meta.setAttribute('property', 'article:tag')
                    meta.content = tag
                    document.head.appendChild(meta)
                })
            }
        }
        return () => {
            document
                .querySelectorAll('meta[property="article:tag"]')
                .forEach((el) => el.remove())
            const kw = document.querySelector('meta[name="keywords"]')
            if (kw) kw.remove()
        }
    }, [keywords, type])

    useEffect(() => {
        const tags: HTMLMetaElement[] = []
        if (type === 'article') {
            if (publishedAt) {
                const meta = document.createElement('meta')
                meta.setAttribute('property', 'article:published_time')
                meta.content = publishedAt
                document.head.appendChild(meta)
                tags.push(meta)
            }
            if (modifiedAt) {
                const meta = document.createElement('meta')
                meta.setAttribute('property', 'article:modified_time')
                meta.content = modifiedAt
                document.head.appendChild(meta)
                tags.push(meta)
            }
            if (author) {
                const meta = document.createElement('meta')
                meta.setAttribute('property', 'article:author')
                meta.content = author
                document.head.appendChild(meta)
                tags.push(meta)
            }
        }
        return () => {
            tags.forEach((el) => el.remove())
        }
    }, [type, publishedAt, modifiedAt, author])

    useEffect(() => {
        if (noIndex) {
            setMetaTag('name', 'robots', 'noindex, nofollow')
        }
        return () => {
            if (noIndex) {
                const meta = document.querySelector('meta[name="robots"]')
                if (meta) meta.remove()
            }
        }
    }, [noIndex])

    return null
}

export default PageTitle