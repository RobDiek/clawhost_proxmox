import type { FC, ReactNode } from 'react'

import { t } from '@openclaw/i18n'
import { Link } from 'react-router-dom'
import { PATHS, ROUTES, getBaseDomain } from '@/lib'
import { Button } from '@/components/ui'
import {
    LegalContactSection,
    LegalPageLayout,
    LegalSection
} from '@/components'

const AffiliateProgram: FC = (): ReactNode => {
    return (
        <LegalPageLayout
            titleKey='affiliateProgram.title'
            descriptionKey='affiliateProgram.description'
            lastUpdatedKey='affiliateProgram.lastUpdated'
            url={`https://${getBaseDomain()}/${PATHS.AFFILIATE_PROGRAM}`}
        >
            <LegalSection
                titleKey='affiliateProgram.overviewTitle'
                textKey='affiliateProgram.overviewText'
            />

            <LegalSection
                titleKey='affiliateProgram.howItWorksTitle'
                textKey='affiliateProgram.howItWorksText'
                items={[
                    'affiliateProgram.howItWorksStep1',
                    'affiliateProgram.howItWorksStep2',
                    'affiliateProgram.howItWorksStep3',
                    'affiliateProgram.howItWorksStep4'
                ]}
            />

            <LegalSection
                titleKey='affiliateProgram.earningsTitle'
                textKey='affiliateProgram.earningsText'
                items={[
                    'affiliateProgram.earningsCommission',
                    'affiliateProgram.earningsMonthly',
                    'affiliateProgram.earningsYearly',
                    'affiliateProgram.earningsPayout',
                    'affiliateProgram.earningsPaymentMethod',
                    'affiliateProgram.earningsCurrency'
                ]}
            />

            <LegalSection
                titleKey='affiliateProgram.referralCodeTitle'
                textKey='affiliateProgram.referralCodeText'
                items={[
                    'affiliateProgram.referralCodeUnique',
                    'affiliateProgram.referralCodeOneChange',
                    'affiliateProgram.referralCodeFormat'
                ]}
            />

            <LegalSection
                titleKey='affiliateProgram.referralWindowTitle'
                textKey='affiliateProgram.referralWindowText'
            />

            <LegalSection
                titleKey='affiliateProgram.eligibilityTitle'
                textKey='affiliateProgram.eligibilityText'
                items={[
                    'affiliateProgram.eligibilityAccount',
                    'affiliateProgram.eligibilityStanding',
                    'affiliateProgram.eligibilityAge'
                ]}
            />

            <LegalSection
                titleKey='affiliateProgram.rulesTitle'
                textKey='affiliateProgram.rulesText'
                items={[
                    'affiliateProgram.rulesNoSelfReferral',
                    'affiliateProgram.rulesNoFakeAccounts',
                    'affiliateProgram.rulesNoSpam',
                    'affiliateProgram.rulesNoMisrepresentation',
                    'affiliateProgram.rulesNoIncentivized'
                ]}
            />

            <LegalSection
                titleKey='affiliateProgram.terminationTitle'
                textKey='affiliateProgram.terminationText'
            />

            <LegalSection
                titleKey='affiliateProgram.marketingTitle'
                textKey='affiliateProgram.marketingText'
                items={[
                    'affiliateProgram.marketingSocial',
                    'affiliateProgram.marketingBlog',
                    'affiliateProgram.marketingVideo',
                    'affiliateProgram.marketingCommunity',
                    'affiliateProgram.marketingNewsletter',
                    'affiliateProgram.marketingComparison'
                ]}
            />

            <LegalSection
                titleKey='affiliateProgram.changesToProgramTitle'
                textKey='affiliateProgram.changesToProgramText'
            />

            <LegalSection
                titleKey='affiliateProgram.getStartedTitle'
                textKey='affiliateProgram.getStartedText'
            >
                <div className='not-prose mt-4'>
                    <Button asChild size='lg'>
                        <Link to={ROUTES.AFFILIATE}>
                            {t('affiliateProgram.getStartedButton')}
                        </Link>
                    </Button>
                </div>
            </LegalSection>

            <LegalContactSection
                titleKey='affiliateProgram.contactTitle'
                textKey='affiliateProgram.contactText'
            />
        </LegalPageLayout>
    )
}

export default AffiliateProgram