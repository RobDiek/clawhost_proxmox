import type { FC, ReactNode } from 'react'

import { motion } from 'framer-motion'
import { t } from '@openclaw/i18n'
import { CircleIcon } from '@phosphor-icons/react'
import { CHANGELOG_FEATURE_TYPE } from '@/lib/constants'
import { PATHS, RELEASES, getBaseDomain } from '@/lib'

import {
    BlogCTA,
    Header,
    LandingFooter,
    PageBackground,
    PageTitle
} from '@/components'

const Changelog: FC = (): ReactNode => {
    return (
        <div className='bg-background text-foreground relative flex min-h-screen flex-col'>
            <PageTitle
                title={t('changelog.title')}
                description={t('changelog.description')}
                image={`https://${getBaseDomain()}/changelog-thumbnail.webp`}
                url={`https://${getBaseDomain()}/${PATHS.CHANGELOG}`}
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
                    {t('changelog.title')}
                </h1>
                <p className='text-muted-foreground mb-16'>
                    {t('changelog.subtitle')}
                </p>

                <div className='relative space-y-8 md:space-y-16'>
                    <div className='from-foreground/20 via-foreground/10 absolute left-[19px] top-6 hidden h-[calc(100%-3rem)] w-px bg-gradient-to-b to-transparent md:block' />

                    {RELEASES.map((release, index) => (
                        <motion.div
                            key={release.titleKey}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{
                                duration: 0.4,
                                delay: 0.1 + index * 0.05
                            }}
                            className='cv-auto relative md:pl-14'
                        >
                            <div className='absolute left-0 top-1 hidden md:block'>
                                <div className='border-border bg-foreground/[0.04] flex h-10 w-10 items-center justify-center rounded-full border'>
                                    <div className='bg-foreground/60 h-2 w-2 rounded-full' />
                                </div>
                            </div>

                            <div className='border-border bg-foreground/[0.02] rounded-2xl border p-8'>
                                <time className='text-muted-foreground mb-4 block text-sm'>
                                    {t(release.dateKey)}
                                </time>

                                <h2 className='font-clash mb-2 text-2xl font-bold'>
                                    {t(release.titleKey)}
                                </h2>

                                <p className='text-muted-foreground mb-6 leading-relaxed'>
                                    {t(release.descriptionKey)}
                                </p>

                                <ul className='space-y-3'>
                                    {release.features.map((feature) => (
                                        <li
                                            key={feature.key}
                                            className='flex items-center gap-3'
                                        >
                                            {feature.type ===
                                              CHANGELOG_FEATURE_TYPE.DROPPED ? (
                                                <CircleIcon
                                                    className='h-2.5 w-2.5 flex-shrink-0 text-red-600 dark:text-red-400'
                                                    weight='fill'
                                                />
                                            ) : (
                                                <CircleIcon
                                                    className='h-2.5 w-2.5 flex-shrink-0 text-green-600 dark:text-green-400'
                                                    weight='fill'
                                                />
                                            )}
                                            <span className='text-foreground text-sm'>
                                                {t(feature.key)}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </motion.div>
                    ))}
                </div>

                <BlogCTA />
            </motion.main>

            <LandingFooter />
        </div>
    )
}

export default Changelog