import type { FC, ReactNode } from 'react'
import type { BlogCardProps } from '@/ts/Interfaces'

import { Link } from 'react-router-dom'
import { t } from '@openclaw/i18n'
import { PATHS, getLocale } from '@/lib'
import { CalendarBlankIcon, ClockIcon } from '@phosphor-icons/react'

const BlogCard: FC<BlogCardProps> = ({ post }): ReactNode => {
    const formattedDate = new Date(post.publishedAt).toLocaleDateString(
        getLocale(),
        {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        }
    )

    return (
        <article className='h-full'>
            <Link
                to={`/${PATHS.BLOG}/${post.slug}`}
                className='border-border bg-foreground/[0.02] hover:border-border hover:bg-foreground/[0.04] group flex h-full min-w-0 flex-col overflow-hidden rounded-xl border p-5 transition'
            >
                <h2 className='font-clash group-hover:text-primary text-foreground mb-2 line-clamp-2 break-words text-lg font-semibold transition'>
                    {post.title}
                </h2>

                <div className='mb-3 flex flex-wrap gap-2'>
                    {post.tags.map((tag) => (
                        <span
                            key={tag}
                            className='bg-foreground/5 text-muted-foreground rounded-full px-2.5 py-0.5 text-xs'
                        >
                            {tag}
                        </span>
                    ))}
                </div>

                <p className='text-muted-foreground mb-4 line-clamp-2 flex-1 text-sm leading-relaxed'>
                    {post.description}
                </p>

                <div className='text-muted-foreground mt-auto flex items-center gap-3 text-xs'>
                    <time
                        dateTime={post.publishedAt}
                        className='flex items-center gap-1.5'
                    >
                        <CalendarBlankIcon className='h-3.5 w-3.5' />
                        {formattedDate}
                    </time>
                    <span className='flex items-center gap-1.5'>
                        <ClockIcon className='h-3.5 w-3.5' />
                        {t('blog.readingTime', {
                            minutes: String(post.readingTime)
                        })}
                    </span>
                </div>
            </Link>
        </article>
    )
}

export default BlogCard