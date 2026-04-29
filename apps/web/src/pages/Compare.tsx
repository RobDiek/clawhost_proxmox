import type { FC, ReactNode } from 'react'
import type { TranslationKey } from '@openclaw/i18n'
import type { CompareFeatureValue } from '@/ts/Interfaces'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { t } from '@openclaw/i18n'
import {
    BlogCTA,
    Header,
    JsonLd,
    LandingFooter,
    PageBackground,
    PageTitle
} from '@/components'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger
} from '@/components/ui'
import { CompareTableDesktop, CompareTableMobile } from '@/components/compare'
import { COMPARE_FEATURE_STATUS } from '@/lib/constants'
import { PATHS, getBaseDomain } from '@/lib'
import { SUPPORT_EMAIL } from '@/lib/links'
import { getCompareData } from '@/data'
import { GITHUB_REPO_URL } from '@/hooks'
import { CheckIcon, XIcon, MinusIcon } from '@phosphor-icons/react'

const Compare: FC = (): ReactNode => {
    const { competitors, categories } = getCompareData()
    const colSpan = competitors.length + 1
    const clawhost = competitors.find((c) => c.highlighted)!
    const otherCompetitors = competitors.filter((c) => !c.highlighted)
    const [selectedCompetitorId, setSelectedCompetitorId] = useState(
        otherCompetitors[0].id
    )
    const selectedCompetitor =
        otherCompetitors.find((c) => c.id === selectedCompetitorId) ||
        otherCompetitors[0]

    const renderStatusIcon = (value: CompareFeatureValue): ReactNode => {
        if (value.status === COMPARE_FEATURE_STATUS.YES) {
            return (
                <CheckIcon
                    className='h-5 w-5 flex-shrink-0 text-green-600 dark:text-green-400'
                    weight='bold'
                />
            )
        }
        if (value.status === COMPARE_FEATURE_STATUS.PARTIAL) {
            return (
                <MinusIcon
                    className='h-5 w-5 flex-shrink-0 text-amber-600 dark:text-amber-400'
                    weight='bold'
                />
            )
        }
        return (
            <XIcon
                className='h-5 w-5 flex-shrink-0 text-red-600 dark:text-red-400'
                weight='bold'
            />
        )
    }

    const renderValue = (value: CompareFeatureValue): ReactNode => (
        <div className='flex flex-col items-center gap-1'>
            {renderStatusIcon(value)}
            {value.detailKey && (
                <span className='text-muted-foreground text-center text-xs'>
                    {t(value.detailKey as TranslationKey)}
                </span>
            )}
        </div>
    )

    return (
        <div className='bg-background text-foreground relative flex min-h-screen flex-col'>
            <PageTitle
                title={t('compare.title')}
                description={t('compare.description')}
                image={`https://${getBaseDomain()}/full-comparison-thumbnail.webp`}
                url={`https://${getBaseDomain()}/${PATHS.COMPARE}`}
            />
            <JsonLd
                data={{
                    '@context': 'https://schema.org',
                    '@type': 'BreadcrumbList',
                    itemListElement: [
                        {
                            '@type': 'ListItem',
                            position: 1,
                            name: t('common.brandName'),
                            item: `https://${getBaseDomain()}`
                        },
                        {
                            '@type': 'ListItem',
                            position: 2,
                            name: t('compare.title'),
                            item: `https://${getBaseDomain()}/${PATHS.COMPARE}`
                        }
                    ]
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
                <h1 className='font-clash mb-2 text-4xl font-bold'>
                    {t('compare.title')}
                </h1>
                <p className='text-muted-foreground mb-16'>
                    {t('compare.description')}
                </p>

                <div className='mb-6 lg:hidden'>
                    <label className='text-muted-foreground mb-2 block text-sm'>
                        {t('compare.compareWith')}
                    </label>
                    <Select
                        value={selectedCompetitorId}
                        onValueChange={setSelectedCompetitorId}
                        displayValue={t(
                            selectedCompetitor.nameKey as TranslationKey
                        )}
                    >
                        <SelectTrigger placeholder={t('compare.compareWith')} />
                        <SelectContent>
                            {otherCompetitors.map((competitor) => (
                                <SelectItem
                                    key={competitor.id}
                                    value={competitor.id}
                                >
                                    {t(competitor.nameKey as TranslationKey)}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className='border-border overflow-hidden rounded-xl border lg:hidden'>
                    <CompareTableMobile
                        categories={categories}
                        clawhost={clawhost}
                        selectedCompetitorId={selectedCompetitorId}
                        selectedCompetitorNameKey={selectedCompetitor.nameKey}
                        renderValue={renderValue}
                    />
                </div>

                <div className='border-border hidden overflow-x-auto rounded-xl border lg:block'>
                    <CompareTableDesktop
                        categories={categories}
                        competitors={competitors}
                        colSpan={colSpan}
                        renderValue={renderValue}
                    />
                </div>

                <p className='text-muted-foreground/60 mt-6 text-center text-sm'>
                    {t('compare.disclaimer')}{' '}
                    <a
                        href={`mailto:${SUPPORT_EMAIL}`}
                        className='text-foreground underline'
                    >
                        {SUPPORT_EMAIL}
                    </a>{' '}
                    {t('compare.disclaimerOr')}{' '}
                    <a
                        href={GITHUB_REPO_URL}
                        target='_blank'
                        rel='noopener noreferrer'
                        className='text-foreground underline'
                    >
                        {t('compare.github')}
                    </a>
                    .
                </p>

                <BlogCTA />
            </motion.main>

            <LandingFooter />
        </div>
    )
}

export default Compare