import type { FC, ReactNode } from 'react'
import type { LegalPageLayoutProps } from '@/ts/Interfaces'

import { motion } from 'framer-motion'
import { t } from '@openclaw/i18n'
import {
    BlogCTA,
    Header,
    LandingFooter,
    PageBackground,
    PageTitle
} from '@/components'

const LegalPageLayout: FC<LegalPageLayoutProps> = ({
    titleKey,
    descriptionKey,
    lastUpdatedKey,
    image,
    url,
    children
}): ReactNode => {
    return (
        <div className='bg-background text-foreground relative flex min-h-screen flex-col'>
            <PageTitle
                title={t(titleKey)}
                description={t(descriptionKey)}
                image={image}
                url={url}
            />
            <PageBackground />
            <Header />

            <motion.main
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className='relative mx-auto w-full max-w-6xl flex-1 px-6 py-12'
            >
                <h1 className='font-clash mb-2 text-4xl font-bold'>
                    {t(titleKey)}
                </h1>
                <p className='text-muted-foreground mb-12'>
                    {t(lastUpdatedKey)}
                </p>

                <div className='prose dark:prose-invert prose-sm max-w-none space-y-8'>
                    {children}
                </div>

                <BlogCTA />
            </motion.main>

            <LandingFooter />
        </div>
    )
}

export default LegalPageLayout