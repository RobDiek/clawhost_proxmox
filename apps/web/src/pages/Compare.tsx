import type { FC, ReactNode } from 'react'
import type { TranslationKey } from '@openclaw/i18n'
import type { CompareFeatureValue } from '@/ts/Interfaces'

import { Fragment, useState } from 'react'
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
import { COMPARE_FEATURE_STATUS } from '@/lib/constants'
import { PATHS, getBaseDomain } from '@/lib'
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
                            (
                                otherCompetitors.find(
                                    (c) => c.id === selectedCompetitorId
                                ) || otherCompetitors[0]
                            ).nameKey as TranslationKey
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
                    <table className='w-full'>
                        <thead>
                            <tr className='border-border border-b'>
                                <th className='text-foreground px-4 py-3 text-left text-sm font-semibold'>
                                    {t('compare.feature')}
                                </th>
                                <th className='text-foreground px-4 py-3 text-center text-sm font-semibold'>
                                    {t(clawhost.nameKey as TranslationKey)}
                                </th>
                                <th className='text-foreground px-4 py-3 text-center text-sm font-semibold'>
                                    {t(
                                        (
                                            otherCompetitors.find(
                                                (c) =>
                                                    c.id ===
                                                    selectedCompetitorId
                                            ) || otherCompetitors[0]
                                        ).nameKey as TranslationKey
                                    )}
                                </th>
                            </tr>
                        </thead>
                        <tbody className='divide-border divide-y'>
                            {categories.map((category) => (
                                <Fragment key={`m-cat-${category.id}`}>
                                    <tr>
                                        <td
                                            colSpan={3}
                                            className='bg-foreground/[0.03] px-4 py-3'
                                        >
                                            <span className='text-foreground text-sm font-semibold'>
                                                {t(
                                                    category.nameKey as TranslationKey
                                                )}
                                            </span>
                                        </td>
                                    </tr>
                                    {category.features.map(
                                        (feature, featureIndex) => (
                                            <tr
                                                key={`m-${category.id}-${featureIndex}`}
                                            >
                                                <td className='text-foreground px-4 py-3 text-sm'>
                                                    {t(
                                                        feature.nameKey as TranslationKey
                                                    )}
                                                </td>
                                                <td className='px-4 py-3'>
                                                    {renderValue(
                                                        feature.values[
                                                            clawhost.id
                                                        ]
                                                    )}
                                                </td>
                                                <td className='px-4 py-3'>
                                                    {renderValue(
                                                        feature.values[
                                                            selectedCompetitorId
                                                        ]
                                                    )}
                                                </td>
                                            </tr>
                                        )
                                    )}
                                </Fragment>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className='border-border hidden overflow-x-auto rounded-xl border lg:block'>
                    <table className='w-full min-w-[700px]'>
                        <thead>
                            <tr className='border-border border-b'>
                                <th className='text-foreground px-6 py-4 text-left text-sm font-semibold'>
                                    {t('compare.feature')}
                                </th>
                                {competitors.map((competitor) => (
                                    <th
                                        key={competitor.id}
                                        className='text-foreground px-6 py-4 text-center text-sm font-semibold'
                                    >
                                        {t(
                                            competitor.nameKey as TranslationKey
                                        )}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className='divide-border divide-y'>
                            {categories.map((category) => (
                                <Fragment key={`cat-${category.id}`}>
                                    <tr>
                                        <td
                                            colSpan={colSpan}
                                            className='bg-foreground/[0.03] px-6 py-3'
                                        >
                                            <span className='text-foreground text-sm font-semibold'>
                                                {t(
                                                    category.nameKey as TranslationKey
                                                )}
                                            </span>
                                        </td>
                                    </tr>
                                    {category.features.map(
                                        (feature, featureIndex) => (
                                            <tr
                                                key={`${category.id}-${featureIndex}`}
                                            >
                                                <td className='text-foreground px-6 py-4 text-sm'>
                                                    {t(
                                                        feature.nameKey as TranslationKey
                                                    )}
                                                </td>
                                                {competitors.map(
                                                    (competitor) => (
                                                        <td
                                                            key={competitor.id}
                                                            className='px-6 py-4'
                                                        >
                                                            {renderValue(
                                                                feature.values[
                                                                    competitor
                                                                        .id
                                                                ]
                                                            )}
                                                        </td>
                                                    )
                                                )}
                                            </tr>
                                        )
                                    )}
                                </Fragment>
                            ))}
                        </tbody>
                    </table>
                </div>

                <p className='text-muted-foreground/60 mt-6 text-center text-sm'>
                    {t('compare.disclaimer')}{' '}
                    <a
                        href='mailto:support@clawhost.cloud'
                        className='text-foreground underline'
                    >
                        support@clawhost.cloud
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