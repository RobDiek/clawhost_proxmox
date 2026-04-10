import type { FC, ReactNode } from 'react'

import { t } from '@openclaw/i18n'
import { PATHS, getBaseDomain } from '@/lib'

import {
    LegalContactSection,
    LegalPageLayout,
    LegalSection
} from '@/components'

const Privacy: FC = (): ReactNode => {
    return (
        <LegalPageLayout
            titleKey='privacy.title'
            descriptionKey='privacy.description'
            lastUpdatedKey='privacy.lastUpdated'
            image={`https://${getBaseDomain()}/privacy-policy-thumbnail.webp`}
            url={`https://${getBaseDomain()}/${PATHS.PRIVACY}`}
        >
            <LegalSection
                titleKey='privacy.introTitle'
                textKey='privacy.introText'
            />

            <LegalSection
                titleKey='privacy.authTitle'
                textKey='privacy.authText'
            />

            <LegalSection
                titleKey='privacy.collectTitle'
                textKey='privacy.collectText'
            >
                <h3 className='mb-2 text-lg font-medium'>
                    {t('privacy.personalInfoTitle')}
                </h3>
                <ul className='text-muted-foreground list-inside list-disc space-y-2'>
                    <li>{t('privacy.personalInfoEmail')}</li>
                    <li>{t('privacy.personalInfoName')}</li>
                    <li>{t('privacy.personalInfoPayment')}</li>
                </ul>

                <h3 className='mb-2 mt-4 text-lg font-medium'>
                    {t('privacy.serverInfoTitle')}
                </h3>

                <ul className='text-muted-foreground list-inside list-disc space-y-2'>
                    <li>{t('privacy.serverInfoConfig')}</li>
                    <li>{t('privacy.serverInfoIp')}</li>
                    <li>{t('privacy.serverInfoResources')}</li>
                </ul>
            </LegalSection>

            <LegalSection
                titleKey='privacy.useTitle'
                textKey='privacy.useText'
                items={[
                    'privacy.useProvide',
                    'privacy.useTransactions',
                    'privacy.useNotices',
                    'privacy.useSupport',
                    'privacy.useAnalyze',
                    'privacy.useFraud'
                ]}
            />

            <LegalSection
                titleKey='privacy.sharingTitle'
                textKey='privacy.sharingText'
                items={[
                    'privacy.sharingProviders',
                    'privacy.sharingLegal',
                    'privacy.sharingBusiness'
                ]}
            />

            <LegalSection
                titleKey='privacy.securityTitle'
                textKey='privacy.securityText'
            />

            <LegalSection
                titleKey='privacy.retentionTitle'
                textKey='privacy.retentionText'
            />

            <LegalSection
                titleKey='privacy.rightsTitle'
                textKey='privacy.rightsText'
                items={[
                    'privacy.rightsAccess',
                    'privacy.rightsCorrect',
                    'privacy.rightsDelete',
                    'privacy.rightsObject',
                    'privacy.rightsPortability',
                    'privacy.rightsWithdraw'
                ]}
            />

            <LegalSection
                titleKey='privacy.cookiesTitle'
                textKey='privacy.cookiesText'
            />

            <LegalSection
                titleKey='privacy.transfersTitle'
                textKey='privacy.transfersText'
            />

            <LegalSection
                titleKey='privacy.eligibilityTitle'
                textKey='privacy.eligibilityText'
            />

            <LegalSection
                titleKey='privacy.changesTitle'
                textKey='privacy.changesText'
            />

            <LegalContactSection
                titleKey='privacy.contactTitle'
                textKey='privacy.contactText'
            />
        </LegalPageLayout>
    )
}

export default Privacy