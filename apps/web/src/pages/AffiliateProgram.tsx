import type { FC, ReactNode } from 'react'

import { motion } from 'framer-motion'
import { t } from '@openclaw/i18n'
import { LEGAL_EMAIL } from '@/lib/links'
import {
    BlogCTA,
    Header,
    LandingFooter,
    PageBackground,
    PageTitle
} from '@/components'
import { Button } from '@/components/ui/button'
import { PATHS, ROUTES, getBaseDomain } from '@/lib'
import { Link } from 'react-router-dom'

const AffiliateProgram: FC = (): ReactNode => {
    return (
        <div className='bg-background text-foreground relative flex min-h-screen flex-col'>
            <PageTitle
                title={t('affiliateProgram.title')}
                description={t('affiliateProgram.description')}
                url={`https://${getBaseDomain()}/${PATHS.AFFILIATE_PROGRAM}`}
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
                    {t('affiliateProgram.title')}
                </h1>
                <p className='text-muted-foreground mb-12'>
                    {t('affiliateProgram.lastUpdated')}
                </p>

                <div className='prose dark:prose-invert prose-sm max-w-none space-y-8'>
                    <section>
                        <h2 className='mb-3 text-xl font-semibold'>
                            {t('affiliateProgram.overviewTitle')}
                        </h2>
                        <p className='text-muted-foreground leading-relaxed'>
                            {t('affiliateProgram.overviewText')}
                        </p>
                    </section>

                    <section>
                        <h2 className='mb-3 text-xl font-semibold'>
                            {t('affiliateProgram.howItWorksTitle')}
                        </h2>
                        <p className='text-muted-foreground leading-relaxed'>
                            {t('affiliateProgram.howItWorksText')}
                        </p>
                        <ul className='text-muted-foreground mt-2 list-inside list-disc space-y-2'>
                            <li>{t('affiliateProgram.howItWorksStep1')}</li>
                            <li>{t('affiliateProgram.howItWorksStep2')}</li>
                            <li>{t('affiliateProgram.howItWorksStep3')}</li>
                            <li>{t('affiliateProgram.howItWorksStep4')}</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className='mb-3 text-xl font-semibold'>
                            {t('affiliateProgram.earningsTitle')}
                        </h2>
                        <p className='text-muted-foreground leading-relaxed'>
                            {t('affiliateProgram.earningsText')}
                        </p>
                        <ul className='text-muted-foreground mt-2 list-inside list-disc space-y-2'>
                            <li>{t('affiliateProgram.earningsCommission')}</li>
                            <li>{t('affiliateProgram.earningsMonthly')}</li>
                            <li>{t('affiliateProgram.earningsYearly')}</li>
                            <li>{t('affiliateProgram.earningsPayout')}</li>
                            <li>
                                {t('affiliateProgram.earningsPaymentMethod')}
                            </li>
                            <li>{t('affiliateProgram.earningsCurrency')}</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className='mb-3 text-xl font-semibold'>
                            {t('affiliateProgram.referralCodeTitle')}
                        </h2>
                        <p className='text-muted-foreground leading-relaxed'>
                            {t('affiliateProgram.referralCodeText')}
                        </p>
                        <ul className='text-muted-foreground mt-2 list-inside list-disc space-y-2'>
                            <li>{t('affiliateProgram.referralCodeUnique')}</li>
                            <li>
                                {t('affiliateProgram.referralCodeOneChange')}
                            </li>
                            <li>{t('affiliateProgram.referralCodeFormat')}</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className='mb-3 text-xl font-semibold'>
                            {t('affiliateProgram.referralWindowTitle')}
                        </h2>
                        <p className='text-muted-foreground leading-relaxed'>
                            {t('affiliateProgram.referralWindowText')}
                        </p>
                    </section>

                    <section>
                        <h2 className='mb-3 text-xl font-semibold'>
                            {t('affiliateProgram.eligibilityTitle')}
                        </h2>
                        <p className='text-muted-foreground leading-relaxed'>
                            {t('affiliateProgram.eligibilityText')}
                        </p>
                        <ul className='text-muted-foreground mt-2 list-inside list-disc space-y-2'>
                            <li>{t('affiliateProgram.eligibilityAccount')}</li>
                            <li>{t('affiliateProgram.eligibilityStanding')}</li>
                            <li>{t('affiliateProgram.eligibilityAge')}</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className='mb-3 text-xl font-semibold'>
                            {t('affiliateProgram.rulesTitle')}
                        </h2>
                        <p className='text-muted-foreground leading-relaxed'>
                            {t('affiliateProgram.rulesText')}
                        </p>
                        <ul className='text-muted-foreground mt-2 list-inside list-disc space-y-2'>
                            <li>{t('affiliateProgram.rulesNoSelfReferral')}</li>
                            <li>{t('affiliateProgram.rulesNoFakeAccounts')}</li>
                            <li>{t('affiliateProgram.rulesNoSpam')}</li>
                            <li>
                                {t('affiliateProgram.rulesNoMisrepresentation')}
                            </li>
                            <li>{t('affiliateProgram.rulesNoIncentivized')}</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className='mb-3 text-xl font-semibold'>
                            {t('affiliateProgram.terminationTitle')}
                        </h2>
                        <p className='text-muted-foreground leading-relaxed'>
                            {t('affiliateProgram.terminationText')}
                        </p>
                    </section>

                    <section>
                        <h2 className='mb-3 text-xl font-semibold'>
                            {t('affiliateProgram.marketingTitle')}
                        </h2>
                        <p className='text-muted-foreground leading-relaxed'>
                            {t('affiliateProgram.marketingText')}
                        </p>
                        <ul className='text-muted-foreground mt-2 list-inside list-disc space-y-2'>
                            <li>{t('affiliateProgram.marketingSocial')}</li>
                            <li>{t('affiliateProgram.marketingBlog')}</li>
                            <li>{t('affiliateProgram.marketingVideo')}</li>
                            <li>{t('affiliateProgram.marketingCommunity')}</li>
                            <li>{t('affiliateProgram.marketingNewsletter')}</li>
                            <li>{t('affiliateProgram.marketingComparison')}</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className='mb-3 text-xl font-semibold'>
                            {t('affiliateProgram.changesToProgramTitle')}
                        </h2>
                        <p className='text-muted-foreground leading-relaxed'>
                            {t('affiliateProgram.changesToProgramText')}
                        </p>
                    </section>

                    <section>
                        <h2 className='mb-3 text-xl font-semibold'>
                            {t('affiliateProgram.getStartedTitle')}
                        </h2>
                        <p className='text-muted-foreground leading-relaxed'>
                            {t('affiliateProgram.getStartedText')}
                        </p>
                        <div className='not-prose mt-4'>
                            <Button asChild size='lg'>
                                <Link to={ROUTES.AFFILIATE}>
                                    {t('affiliateProgram.getStartedButton')}
                                </Link>
                            </Button>
                        </div>
                    </section>

                    <section>
                        <h2 className='mb-3 text-xl font-semibold'>
                            {t('affiliateProgram.contactTitle')}
                        </h2>
                        <p className='text-muted-foreground leading-relaxed'>
                            {t('affiliateProgram.contactText')}{' '}
                            <a
                                href={LEGAL_EMAIL}
                                className='text-primary hover:underline'
                            >
                                {t('common.legalEmail')}
                            </a>
                        </p>
                    </section>
                </div>

                <BlogCTA />
            </motion.main>

            <LandingFooter />
        </div>
    )
}

export default AffiliateProgram