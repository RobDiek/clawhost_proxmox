import type { FC, ReactNode } from 'react'

import { motion } from 'framer-motion'
import { t } from '@openclaw/i18n'
import {
    BlogCTA,
    Header,
    LandingFooter,
    PageBackground,
    PageTitle
} from '@/components'
import { PATHS, getBaseDomain } from '@/lib'
import { CheckIcon, CircleIcon, XIcon } from '@phosphor-icons/react'

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

                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: 0.1 }}
                        className='relative md:pl-14'
                    >
                        <div className='absolute left-0 top-1 hidden md:block'>
                            <div className='flex h-10 w-10 items-center justify-center rounded-full border border-amber-500/30 bg-amber-500/10'>
                                <div className='h-2 w-2 animate-pulse rounded-full bg-amber-400' />
                            </div>
                        </div>

                        <div className='rounded-2xl border border-amber-500/10 bg-amber-500/[0.02] p-8'>
                            <span className='mb-4 block text-sm font-medium text-amber-600 dark:text-amber-400'>
                                {t('changelog.upcomingRelease')}
                            </span>

                            <h2 className='font-clash mb-2 text-2xl font-bold'>
                                {t('changelog.upcomingReleaseTitle')}
                            </h2>

                            <p className='text-muted-foreground mb-6 leading-relaxed'>
                                {t('changelog.upcomingReleaseDescription')}
                            </p>

                            <ul className='space-y-3'>
                                <li className='flex items-center gap-3'>
                                    <CircleIcon
                                        className='h-2.5 w-2.5 flex-shrink-0 text-amber-600 dark:text-amber-400'
                                        weight='fill'
                                    />
                                    <span className='text-foreground text-sm'>
                                        {t('changelog.upcomingReleaseFeature1')}
                                    </span>
                                </li>
                            </ul>
                        </div>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: 0.2 }}
                        className='relative md:pl-14'
                    >
                        <div className='absolute left-0 top-1 hidden md:block'>
                            <div className='border-border bg-foreground/[0.04] flex h-10 w-10 items-center justify-center rounded-full border'>
                                <div className='bg-foreground/60 h-2 w-2 rounded-full' />
                            </div>
                        </div>

                        <div className='border-border bg-foreground/[0.02] rounded-2xl border p-8'>
                            <time className='text-muted-foreground mb-4 block text-sm'>
                                {t('changelog.release13Date')}
                            </time>

                            <h2 className='font-clash mb-2 text-2xl font-bold'>
                                {t('changelog.release13Title')}
                            </h2>

                            <p className='text-muted-foreground mb-6 leading-relaxed'>
                                {t('changelog.release13Description')}
                            </p>

                            <ul className='space-y-3'>
                                <li className='flex items-center gap-3'>
                                    <CheckIcon className='h-4 w-4 flex-shrink-0 text-green-600 dark:text-green-400' />
                                    <span className='text-foreground text-sm'>
                                        {t('changelog.release13Feature1')}
                                    </span>
                                </li>
                                <li className='flex items-center gap-3'>
                                    <CheckIcon className='h-4 w-4 flex-shrink-0 text-green-600 dark:text-green-400' />
                                    <span className='text-foreground text-sm'>
                                        {t('changelog.release13Feature2')}
                                    </span>
                                </li>
                            </ul>
                        </div>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: 0.3 }}
                        className='relative md:pl-14'
                    >
                        <div className='absolute left-0 top-1 hidden md:block'>
                            <div className='border-border bg-foreground/[0.04] flex h-10 w-10 items-center justify-center rounded-full border'>
                                <div className='bg-foreground/60 h-2 w-2 rounded-full' />
                            </div>
                        </div>

                        <div className='border-border bg-foreground/[0.02] rounded-2xl border p-8'>
                            <time className='text-muted-foreground mb-4 block text-sm'>
                                {t('changelog.release12Date')}
                            </time>

                            <h2 className='font-clash mb-2 text-2xl font-bold'>
                                {t('changelog.release12Title')}
                            </h2>

                            <p className='text-muted-foreground mb-6 leading-relaxed'>
                                {t('changelog.release12Description')}
                            </p>

                            <ul className='space-y-3'>
                                <li className='flex items-center gap-3'>
                                    <CheckIcon className='h-4 w-4 flex-shrink-0 text-green-600 dark:text-green-400' />
                                    <span className='text-foreground text-sm'>
                                        {t('changelog.release12Feature1')}
                                    </span>
                                </li>
                                <li className='flex items-center gap-3'>
                                    <CheckIcon className='h-4 w-4 flex-shrink-0 text-green-600 dark:text-green-400' />
                                    <span className='text-foreground text-sm'>
                                        {t('changelog.release12Feature2')}
                                    </span>
                                </li>
                                <li className='flex items-center gap-3'>
                                    <CheckIcon className='h-4 w-4 flex-shrink-0 text-green-600 dark:text-green-400' />
                                    <span className='text-foreground text-sm'>
                                        {t('changelog.release12Feature3')}
                                    </span>
                                </li>
                                <li className='flex items-center gap-3'>
                                    <CheckIcon className='h-4 w-4 flex-shrink-0 text-green-600 dark:text-green-400' />
                                    <span className='text-foreground text-sm'>
                                        {t('changelog.release12Feature4')}
                                    </span>
                                </li>
                            </ul>
                        </div>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: 0.3 }}
                        className='relative md:pl-14'
                    >
                        <div className='absolute left-0 top-1 hidden md:block'>
                            <div className='border-border bg-foreground/[0.04] flex h-10 w-10 items-center justify-center rounded-full border'>
                                <div className='bg-foreground/60 h-2 w-2 rounded-full' />
                            </div>
                        </div>

                        <div className='border-border bg-foreground/[0.02] rounded-2xl border p-8'>
                            <time className='text-muted-foreground mb-4 block text-sm'>
                                {t('changelog.release11Date')}
                            </time>

                            <h2 className='font-clash mb-2 text-2xl font-bold'>
                                {t('changelog.release11Title')}
                            </h2>

                            <p className='text-muted-foreground mb-6 leading-relaxed'>
                                {t('changelog.release11Description')}
                            </p>

                            <ul className='space-y-3'>
                                <li className='flex items-center gap-3'>
                                    <CheckIcon className='h-4 w-4 flex-shrink-0 text-green-600 dark:text-green-400' />
                                    <span className='text-foreground text-sm'>
                                        {t('changelog.release11Feature1')}
                                    </span>
                                </li>
                                <li className='flex items-center gap-3'>
                                    <CheckIcon className='h-4 w-4 flex-shrink-0 text-green-600 dark:text-green-400' />
                                    <span className='text-foreground text-sm'>
                                        {t('changelog.release11Feature2')}
                                    </span>
                                </li>
                                <li className='flex items-center gap-3'>
                                    <CheckIcon className='h-4 w-4 flex-shrink-0 text-green-600 dark:text-green-400' />
                                    <span className='text-foreground text-sm'>
                                        {t('changelog.release11Feature3')}
                                    </span>
                                </li>
                                <li className='flex items-center gap-3'>
                                    <CheckIcon className='h-4 w-4 flex-shrink-0 text-green-600 dark:text-green-400' />
                                    <span className='text-foreground text-sm'>
                                        {t('changelog.release11Feature4')}
                                    </span>
                                </li>
                                <li className='flex items-center gap-3'>
                                    <CheckIcon className='h-4 w-4 flex-shrink-0 text-green-600 dark:text-green-400' />
                                    <span className='text-foreground text-sm'>
                                        {t('changelog.release11Feature5')}
                                    </span>
                                </li>
                                <li className='flex items-center gap-3'>
                                    <XIcon
                                        className='h-4 w-4 flex-shrink-0 text-red-600 dark:text-red-400'
                                        weight='bold'
                                    />
                                    <span className='text-foreground text-sm'>
                                        {t('changelog.release11Dropped1')}
                                    </span>
                                </li>
                            </ul>
                        </div>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: 0.3 }}
                        className='relative md:pl-14'
                    >
                        <div className='absolute left-0 top-1 hidden md:block'>
                            <div className='border-border bg-foreground/[0.04] flex h-10 w-10 items-center justify-center rounded-full border'>
                                <div className='bg-foreground/60 h-2 w-2 rounded-full' />
                            </div>
                        </div>

                        <div className='border-border bg-foreground/[0.02] rounded-2xl border p-8'>
                            <time className='text-muted-foreground mb-4 block text-sm'>
                                {t('changelog.release10Date')}
                            </time>

                            <h2 className='font-clash mb-2 text-2xl font-bold'>
                                {t('changelog.release10Title')}
                            </h2>

                            <p className='text-muted-foreground mb-6 leading-relaxed'>
                                {t('changelog.release10Description')}
                            </p>

                            <ul className='space-y-3'>
                                <li className='flex items-center gap-3'>
                                    <CheckIcon className='h-4 w-4 flex-shrink-0 text-green-600 dark:text-green-400' />
                                    <span className='text-foreground text-sm'>
                                        {t('changelog.release10Feature1')}
                                    </span>
                                </li>
                                <li className='flex items-center gap-3'>
                                    <CheckIcon className='h-4 w-4 flex-shrink-0 text-green-600 dark:text-green-400' />
                                    <span className='text-foreground text-sm'>
                                        {t('changelog.release10Feature2')}
                                    </span>
                                </li>
                                <li className='flex items-center gap-3'>
                                    <CheckIcon className='h-4 w-4 flex-shrink-0 text-green-600 dark:text-green-400' />
                                    <span className='text-foreground text-sm'>
                                        {t('changelog.release10Feature3')}
                                    </span>
                                </li>
                                <li className='flex items-center gap-3'>
                                    <CheckIcon className='h-4 w-4 flex-shrink-0 text-green-600 dark:text-green-400' />
                                    <span className='text-foreground text-sm'>
                                        {t('changelog.release10Feature5')}
                                    </span>
                                </li>
                                <li className='flex items-center gap-3'>
                                    <CheckIcon className='h-4 w-4 flex-shrink-0 text-green-600 dark:text-green-400' />
                                    <span className='text-foreground text-sm'>
                                        {t('changelog.release10Feature4')}
                                    </span>
                                </li>
                            </ul>
                        </div>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: 0.3 }}
                        className='relative md:pl-14'
                    >
                        <div className='absolute left-0 top-1 hidden md:block'>
                            <div className='border-border bg-foreground/[0.04] flex h-10 w-10 items-center justify-center rounded-full border'>
                                <div className='bg-foreground/60 h-2 w-2 rounded-full' />
                            </div>
                        </div>

                        <div className='border-border bg-foreground/[0.02] rounded-2xl border p-8'>
                            <time className='text-muted-foreground mb-4 block text-sm'>
                                {t('changelog.release9Date')}
                            </time>

                            <h2 className='font-clash mb-2 text-2xl font-bold'>
                                {t('changelog.release9Title')}
                            </h2>

                            <p className='text-muted-foreground mb-6 leading-relaxed'>
                                {t('changelog.release9Description')}
                            </p>

                            <ul className='space-y-3'>
                                <li className='flex items-center gap-3'>
                                    <CheckIcon className='h-4 w-4 flex-shrink-0 text-green-600 dark:text-green-400' />
                                    <span className='text-foreground text-sm'>
                                        {t('changelog.release9Feature1')}
                                    </span>
                                </li>
                                <li className='flex items-center gap-3'>
                                    <CheckIcon className='h-4 w-4 flex-shrink-0 text-green-600 dark:text-green-400' />
                                    <span className='text-foreground text-sm'>
                                        {t('changelog.release9Feature2')}
                                    </span>
                                </li>
                                <li className='flex items-center gap-3'>
                                    <CheckIcon className='h-4 w-4 flex-shrink-0 text-green-600 dark:text-green-400' />
                                    <span className='text-foreground text-sm'>
                                        {t('changelog.release9Feature3')}
                                    </span>
                                </li>
                                <li className='flex items-center gap-3'>
                                    <CheckIcon className='h-4 w-4 flex-shrink-0 text-green-600 dark:text-green-400' />
                                    <span className='text-foreground text-sm'>
                                        {t('changelog.release9Feature4')}
                                    </span>
                                </li>
                                <li className='flex items-center gap-3'>
                                    <CheckIcon className='h-4 w-4 flex-shrink-0 text-green-600 dark:text-green-400' />
                                    <span className='text-foreground text-sm'>
                                        {t('changelog.release9Feature5')}
                                    </span>
                                </li>
                                <li className='flex items-center gap-3'>
                                    <CheckIcon className='h-4 w-4 flex-shrink-0 text-green-600 dark:text-green-400' />
                                    <span className='text-foreground text-sm'>
                                        {t('changelog.release9Feature6')}
                                    </span>
                                </li>
                            </ul>
                        </div>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: 0.3 }}
                        className='relative md:pl-14'
                    >
                        <div className='absolute left-0 top-1 hidden md:block'>
                            <div className='border-border bg-foreground/[0.04] flex h-10 w-10 items-center justify-center rounded-full border'>
                                <div className='bg-foreground/60 h-2 w-2 rounded-full' />
                            </div>
                        </div>

                        <div className='border-border bg-foreground/[0.02] rounded-2xl border p-8'>
                            <time className='text-muted-foreground mb-4 block text-sm'>
                                {t('changelog.release8Date')}
                            </time>

                            <h2 className='font-clash mb-2 text-2xl font-bold'>
                                {t('changelog.release8Title')}
                            </h2>

                            <p className='text-muted-foreground mb-6 leading-relaxed'>
                                {t('changelog.release8Description')}
                            </p>

                            <ul className='space-y-3'>
                                <li className='flex items-center gap-3'>
                                    <CheckIcon className='h-4 w-4 flex-shrink-0 text-green-600 dark:text-green-400' />
                                    <span className='text-foreground text-sm'>
                                        {t('changelog.release8Feature1')}
                                    </span>
                                </li>
                                <li className='flex items-center gap-3'>
                                    <CheckIcon className='h-4 w-4 flex-shrink-0 text-green-600 dark:text-green-400' />
                                    <span className='text-foreground text-sm'>
                                        {t('changelog.release8Feature2')}
                                    </span>
                                </li>
                                <li className='flex items-center gap-3'>
                                    <CheckIcon className='h-4 w-4 flex-shrink-0 text-green-600 dark:text-green-400' />
                                    <span className='text-foreground text-sm'>
                                        {t('changelog.release8Feature3')}
                                    </span>
                                </li>
                            </ul>
                        </div>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: 0.3 }}
                        className='relative md:pl-14'
                    >
                        <div className='absolute left-0 top-1 hidden md:block'>
                            <div className='border-border bg-foreground/[0.04] flex h-10 w-10 items-center justify-center rounded-full border'>
                                <div className='bg-foreground/60 h-2 w-2 rounded-full' />
                            </div>
                        </div>

                        <div className='border-border bg-foreground/[0.02] rounded-2xl border p-8'>
                            <time className='text-muted-foreground mb-4 block text-sm'>
                                {t('changelog.release7Date')}
                            </time>

                            <h2 className='font-clash mb-2 text-2xl font-bold'>
                                {t('changelog.release7Title')}
                            </h2>

                            <p className='text-muted-foreground mb-6 leading-relaxed'>
                                {t('changelog.release7Description')}
                            </p>

                            <ul className='space-y-3'>
                                <li className='flex items-center gap-3'>
                                    <CheckIcon className='h-4 w-4 flex-shrink-0 text-green-600 dark:text-green-400' />
                                    <span className='text-foreground text-sm'>
                                        {t('changelog.release7Feature1')}
                                    </span>
                                </li>
                                <li className='flex items-center gap-3'>
                                    <CheckIcon className='h-4 w-4 flex-shrink-0 text-green-600 dark:text-green-400' />
                                    <span className='text-foreground text-sm'>
                                        {t('changelog.release7Feature2')}
                                    </span>
                                </li>
                                <li className='flex items-center gap-3'>
                                    <CheckIcon className='h-4 w-4 flex-shrink-0 text-green-600 dark:text-green-400' />
                                    <span className='text-foreground text-sm'>
                                        {t('changelog.release7Feature3')}
                                    </span>
                                </li>
                                <li className='flex items-center gap-3'>
                                    <CheckIcon className='h-4 w-4 flex-shrink-0 text-green-600 dark:text-green-400' />
                                    <span className='text-foreground text-sm'>
                                        {t('changelog.release7Feature4')}
                                    </span>
                                </li>
                            </ul>
                        </div>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: 0.3 }}
                        className='relative md:pl-14'
                    >
                        <div className='absolute left-0 top-1 hidden md:block'>
                            <div className='border-border bg-foreground/[0.04] flex h-10 w-10 items-center justify-center rounded-full border'>
                                <div className='bg-foreground/60 h-2 w-2 rounded-full' />
                            </div>
                        </div>

                        <div className='border-border bg-foreground/[0.02] rounded-2xl border p-8'>
                            <time className='text-muted-foreground mb-4 block text-sm'>
                                {t('changelog.release6Date')}
                            </time>

                            <h2 className='font-clash mb-2 text-2xl font-bold'>
                                {t('changelog.release6Title')}
                            </h2>

                            <p className='text-muted-foreground mb-6 leading-relaxed'>
                                {t('changelog.release6Description')}
                            </p>

                            <ul className='space-y-3'>
                                <li className='flex items-center gap-3'>
                                    <CheckIcon className='h-4 w-4 flex-shrink-0 text-green-600 dark:text-green-400' />
                                    <span className='text-foreground text-sm'>
                                        {t('changelog.release6Feature1')}
                                    </span>
                                </li>
                                <li className='flex items-center gap-3'>
                                    <CheckIcon className='h-4 w-4 flex-shrink-0 text-green-600 dark:text-green-400' />
                                    <span className='text-foreground text-sm'>
                                        {t('changelog.release6Feature2')}
                                    </span>
                                </li>
                                <li className='flex items-center gap-3'>
                                    <CheckIcon className='h-4 w-4 flex-shrink-0 text-green-600 dark:text-green-400' />
                                    <span className='text-foreground text-sm'>
                                        {t('changelog.release6Feature3')}
                                    </span>
                                </li>
                                <li className='flex items-center gap-3'>
                                    <CheckIcon className='h-4 w-4 flex-shrink-0 text-green-600 dark:text-green-400' />
                                    <span className='text-foreground text-sm'>
                                        {t('changelog.release6Feature4')}
                                    </span>
                                </li>
                            </ul>
                        </div>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: 0.4 }}
                        className='relative md:pl-14'
                    >
                        <div className='absolute left-0 top-1 hidden md:block'>
                            <div className='border-border bg-foreground/[0.04] flex h-10 w-10 items-center justify-center rounded-full border'>
                                <div className='bg-foreground/60 h-2 w-2 rounded-full' />
                            </div>
                        </div>

                        <div className='border-border bg-foreground/[0.02] rounded-2xl border p-8'>
                            <time className='text-muted-foreground mb-4 block text-sm'>
                                {t('changelog.release4Date')}
                            </time>

                            <h2 className='font-clash mb-2 text-2xl font-bold'>
                                {t('changelog.release4Title')}
                            </h2>

                            <p className='text-muted-foreground mb-6 leading-relaxed'>
                                {t('changelog.release4Description')}
                            </p>

                            <ul className='space-y-3'>
                                <li className='flex items-center gap-3'>
                                    <CheckIcon className='h-4 w-4 flex-shrink-0 text-green-600 dark:text-green-400' />
                                    <span className='text-foreground text-sm'>
                                        {t('changelog.release4Feature1')}
                                    </span>
                                </li>
                                <li className='flex items-center gap-3'>
                                    <CheckIcon className='h-4 w-4 flex-shrink-0 text-green-600 dark:text-green-400' />
                                    <span className='text-foreground text-sm'>
                                        {t('changelog.release4Feature2')}
                                    </span>
                                </li>
                                <li className='flex items-center gap-3'>
                                    <CheckIcon className='h-4 w-4 flex-shrink-0 text-green-600 dark:text-green-400' />
                                    <span className='text-foreground text-sm'>
                                        {t('changelog.release4Feature3')}
                                    </span>
                                </li>
                                <li className='flex items-center gap-3'>
                                    <CheckIcon className='h-4 w-4 flex-shrink-0 text-green-600 dark:text-green-400' />
                                    <span className='text-foreground text-sm'>
                                        {t('changelog.release4Feature4')}
                                    </span>
                                </li>
                            </ul>
                        </div>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: 0.5 }}
                        className='relative md:pl-14'
                    >
                        <div className='absolute left-0 top-1 hidden md:block'>
                            <div className='border-border bg-foreground/[0.04] flex h-10 w-10 items-center justify-center rounded-full border'>
                                <div className='bg-foreground/60 h-2 w-2 rounded-full' />
                            </div>
                        </div>

                        <div className='border-border bg-foreground/[0.02] rounded-2xl border p-8'>
                            <time className='text-muted-foreground mb-4 block text-sm'>
                                {t('changelog.release3Date')}
                            </time>

                            <h2 className='font-clash mb-2 text-2xl font-bold'>
                                {t('changelog.release3Title')}
                            </h2>

                            <p className='text-muted-foreground mb-6 leading-relaxed'>
                                {t('changelog.release3Description')}
                            </p>

                            <ul className='space-y-3'>
                                <li className='flex items-center gap-3'>
                                    <CheckIcon className='h-4 w-4 flex-shrink-0 text-green-600 dark:text-green-400' />
                                    <span className='text-foreground text-sm'>
                                        {t('changelog.release3Feature1')}
                                    </span>
                                </li>
                                <li className='flex items-center gap-3'>
                                    <CheckIcon className='h-4 w-4 flex-shrink-0 text-green-600 dark:text-green-400' />
                                    <span className='text-foreground text-sm'>
                                        {t('changelog.release3Feature2')}
                                    </span>
                                </li>
                                <li className='flex items-center gap-3'>
                                    <CheckIcon className='h-4 w-4 flex-shrink-0 text-green-600 dark:text-green-400' />
                                    <span className='text-foreground text-sm'>
                                        {t('changelog.release3Feature3')}
                                    </span>
                                </li>
                            </ul>
                        </div>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: 0.7 }}
                        className='relative md:pl-14'
                    >
                        <div className='absolute left-0 top-1 hidden md:block'>
                            <div className='border-border bg-foreground/[0.04] flex h-10 w-10 items-center justify-center rounded-full border'>
                                <div className='bg-foreground/60 h-2 w-2 rounded-full' />
                            </div>
                        </div>

                        <div className='border-border bg-foreground/[0.02] rounded-2xl border p-8'>
                            <time className='text-muted-foreground mb-4 block text-sm'>
                                {t('changelog.release2Date')}
                            </time>

                            <h2 className='font-clash mb-2 text-2xl font-bold'>
                                {t('changelog.release2Title')}
                            </h2>

                            <p className='text-muted-foreground mb-6 leading-relaxed'>
                                {t('changelog.release2Description')}
                            </p>

                            <ul className='space-y-3'>
                                <li className='flex items-center gap-3'>
                                    <CheckIcon className='h-4 w-4 flex-shrink-0 text-green-600 dark:text-green-400' />
                                    <span className='text-foreground text-sm'>
                                        {t('changelog.release2Feature1')}
                                    </span>
                                </li>
                            </ul>
                        </div>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: 0.7 }}
                        className='relative md:pl-14'
                    >
                        <div className='absolute left-0 top-1 hidden md:block'>
                            <div className='border-border bg-foreground/[0.04] flex h-10 w-10 items-center justify-center rounded-full border'>
                                <div className='bg-foreground/60 h-2 w-2 rounded-full' />
                            </div>
                        </div>

                        <div className='border-border bg-foreground/[0.02] rounded-2xl border p-8'>
                            <time className='text-muted-foreground mb-4 block text-sm'>
                                {t('changelog.release1Date')}
                            </time>

                            <h2 className='font-clash mb-2 text-2xl font-bold'>
                                {t('changelog.release1Title')}
                            </h2>

                            <p className='text-muted-foreground mb-6 leading-relaxed'>
                                {t('changelog.release1Description')}
                            </p>

                            <ul className='space-y-3'>
                                <li className='flex items-center gap-3'>
                                    <CheckIcon className='h-4 w-4 flex-shrink-0 text-green-600 dark:text-green-400' />
                                    <span className='text-foreground text-sm'>
                                        {t('changelog.release1Feature1')}
                                    </span>
                                </li>
                                <li className='flex items-center gap-3'>
                                    <CheckIcon className='h-4 w-4 flex-shrink-0 text-green-600 dark:text-green-400' />
                                    <span className='text-foreground text-sm'>
                                        {t('changelog.release1Feature2')}
                                    </span>
                                </li>
                                <li className='flex items-center gap-3'>
                                    <CheckIcon className='h-4 w-4 flex-shrink-0 text-green-600 dark:text-green-400' />
                                    <span className='text-foreground text-sm'>
                                        {t('changelog.release1Feature3')}
                                    </span>
                                </li>
                                <li className='flex items-center gap-3'>
                                    <CheckIcon className='h-4 w-4 flex-shrink-0 text-green-600 dark:text-green-400' />
                                    <span className='text-foreground text-sm'>
                                        {t('changelog.release1Feature4')}
                                    </span>
                                </li>
                                <li className='flex items-center gap-3'>
                                    <CheckIcon className='h-4 w-4 flex-shrink-0 text-green-600 dark:text-green-400' />
                                    <span className='text-foreground text-sm'>
                                        {t('changelog.release1Feature5')}
                                    </span>
                                </li>
                                <li className='flex items-center gap-3'>
                                    <CheckIcon className='h-4 w-4 flex-shrink-0 text-green-600 dark:text-green-400' />
                                    <span className='text-foreground text-sm'>
                                        {t('changelog.release1Feature6')}
                                    </span>
                                </li>
                                <li className='flex items-center gap-3'>
                                    <CheckIcon className='h-4 w-4 flex-shrink-0 text-green-600 dark:text-green-400' />
                                    <span className='text-foreground text-sm'>
                                        {t('changelog.release1Feature7')}
                                    </span>
                                </li>
                                <li className='flex items-center gap-3'>
                                    <CheckIcon className='h-4 w-4 flex-shrink-0 text-green-600 dark:text-green-400' />
                                    <span className='text-foreground text-sm'>
                                        {t('changelog.release1Feature8')}
                                    </span>
                                </li>
                                <li className='flex items-center gap-3'>
                                    <CheckIcon className='h-4 w-4 flex-shrink-0 text-green-600 dark:text-green-400' />
                                    <span className='text-foreground text-sm'>
                                        {t('changelog.release1Feature9')}
                                    </span>
                                </li>
                                <li className='flex items-center gap-3'>
                                    <CheckIcon className='h-4 w-4 flex-shrink-0 text-green-600 dark:text-green-400' />
                                    <span className='text-foreground text-sm'>
                                        {t('changelog.release1Feature10')}
                                    </span>
                                </li>
                                <li className='flex items-center gap-3'>
                                    <CheckIcon className='h-4 w-4 flex-shrink-0 text-green-600 dark:text-green-400' />
                                    <span className='text-foreground text-sm'>
                                        {t('changelog.release1Feature11')}
                                    </span>
                                </li>
                            </ul>
                        </div>
                    </motion.div>
                </div>

                <BlogCTA />
            </motion.main>

            <LandingFooter />
        </div>
    )
}

export default Changelog