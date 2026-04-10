import type { FC, ReactNode } from 'react'

import { PATHS, getBaseDomain } from '@/lib'

import {
    LegalContactSection,
    LegalPageLayout,
    LegalSection
} from '@/components'

const Terms: FC = (): ReactNode => {
    return (
        <LegalPageLayout
            titleKey='terms.title'
            descriptionKey='terms.description'
            lastUpdatedKey='terms.lastUpdated'
            image={`https://${getBaseDomain()}/tos-thumbnail.webp`}
            url={`https://${getBaseDomain()}/${PATHS.TERMS}`}
        >
            <LegalSection
                titleKey='terms.acceptanceTitle'
                textKey='terms.acceptanceText'
            />

            <LegalSection
                titleKey='terms.serviceTitle'
                textKey='terms.serviceText'
            />

            <LegalSection titleKey='terms.authTitle' textKey='terms.authText' />

            <LegalSection
                titleKey='terms.responsibilitiesTitle'
                textKey='terms.responsibilitiesText'
                items={[
                    'terms.responsibilitiesAccurate',
                    'terms.responsibilitiesSecurity',
                    'terms.responsibilitiesCompliance',
                    'terms.responsibilitiesLegal',
                    'terms.responsibilitiesAccess'
                ]}
            />

            <LegalSection
                titleKey='terms.prohibitedTitle'
                textKey='terms.prohibitedText'
                items={[
                    'terms.prohibitedMalware',
                    'terms.prohibitedDos',
                    'terms.prohibitedSpam',
                    'terms.prohibitedIllegal',
                    'terms.prohibitedIp',
                    'terms.prohibitedMining',
                    'terms.prohibitedOther'
                ]}
            />

            <LegalSection
                titleKey='terms.paymentTitle'
                textKey='terms.paymentText'
            />

            <LegalSection
                titleKey='terms.availabilityTitle'
                textKey='terms.availabilityText'
            />

            <LegalSection
                titleKey='terms.liabilityTitle'
                textKey='terms.liabilityText'
            />

            <LegalSection
                titleKey='terms.terminationTitle'
                textKey='terms.terminationText'
            />

            <LegalSection
                titleKey='terms.changesToTermsTitle'
                textKey='terms.changesToTermsText'
            />

            <LegalSection
                titleKey='terms.affiliateTitle'
                textKey='terms.affiliateText'
                items={[
                    'terms.affiliateCodeUnique',
                    'terms.affiliateCodeOneChange',
                    'terms.affiliateReferralWindow',
                    'terms.affiliateNoSelfReferral',
                    'terms.affiliateAbuse'
                ]}
            />

            <LegalContactSection
                titleKey='terms.contactTitle'
                textKey='terms.contactText'
            />
        </LegalPageLayout>
    )
}

export default Terms