import type { FC, ReactNode } from 'react'

import { t } from '@openclaw/i18n'
import { HeroButtons } from '@/components/landing'
import { GoWaitlistCTA } from '@/components/go'
import { usePreferencesStore } from '@/lib/store'
import { PRODUCT } from '@/lib/constants'

const BlogCTA: FC = (): ReactNode => {
    const product = usePreferencesStore((s) => s.product)
    const isGo = product === PRODUCT.GO

    return (
        <div className='border-border/50 mt-16 rounded-2xl border bg-gradient-to-b from-white/[0.03] to-transparent px-6 py-12 text-center'>
            <h2 className='font-clash mb-4 text-3xl font-bold'>
                {isGo ? t('go.ctaTitle') : t('blog.ctaTitle')}
            </h2>
            <p className='text-muted-foreground mx-auto mb-8 max-w-xl text-base'>
                {isGo ? t('go.ctaDescription') : t('blog.ctaDescription')}
            </p>
            <div className='flex flex-col items-center justify-center gap-4 sm:flex-row'>
                {isGo ? (
                    <GoWaitlistCTA />
                ) : (
                    <HeroButtons
                        deployLabel={t('blog.ctaDeploy')}
                        githubLabel={t('blog.ctaGitHub')}
                        showStars={true}
                    />
                )}
            </div>
        </div>
    )
}

export default BlogCTA