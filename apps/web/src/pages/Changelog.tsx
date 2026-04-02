import type { FC, ReactNode } from 'react'

import { motion } from 'framer-motion'
import { t } from '@openclaw/i18n'
import { CheckIcon, CircleIcon, XIcon } from '@phosphor-icons/react'
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
                                {release.upcoming ? (
                                    <div className='flex h-10 w-10 items-center justify-center rounded-full border border-amber-500/30 bg-amber-500/10'>
                                        <div className='h-2 w-2 animate-pulse rounded-full bg-amber-400' />
                                    </div>
                                ) : (
                                    <div className='border-border bg-foreground/[0.04] flex h-10 w-10 items-center justify-center rounded-full border'>
                                        <div className='bg-foreground/60 h-2 w-2 rounded-full' />
                                    </div>
                                )}
                            </div>

                            <div
                                className={
                                    release.upcoming
                                        ? 'rounded-2xl border border-amber-500/10 bg-amber-500/[0.02] p-8'
                                        : 'border-border bg-foreground/[0.02] rounded-2xl border p-8'
                                }
                            >
                                {release.upcoming ? (
                                    <span className='mb-4 block text-sm font-medium text-amber-600 dark:text-amber-400'>
                                        {t(release.dateKey)}
                                    </span>
                                ) : (
                                    <time className='text-muted-foreground mb-4 block text-sm'>
                                        {t(release.dateKey)}
                                    </time>
                                )}

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
                                            {release.upcoming ? (
                                                <CircleIcon
                                                    className='h-2.5 w-2.5 flex-shrink-0 text-amber-600 dark:text-amber-400'
                                                    weight='fill'
                                                />
                                            ) : feature.type ===
                                              CHANGELOG_FEATURE_TYPE.DROPPED ? (
                                                <XIcon
                                                    className='h-4 w-4 flex-shrink-0 text-red-600 dark:text-red-400'
                                                    weight='bold'
                                                />
                                            ) : (
                                                <CheckIcon className='h-4 w-4 flex-shrink-0 text-green-600 dark:text-green-400' />
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