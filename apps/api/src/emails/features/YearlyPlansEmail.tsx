import type { FC, ReactNode } from 'react'

import { t } from '@openclaw/i18n'
import { Button, Section, Text } from '@react-email/components'

import FeatureEmailLayout from '@/emails/features/FeatureEmailLayout'
import { heading, paragraph, button, buttonContainer } from '@/emails/styles'

const YearlyPlansEmail: FC = (): ReactNode => {
    return (
        <FeatureEmailLayout preview={t('emails.features.yearlyPlans.preview')}>
            <Text style={heading}>
                {t('emails.features.yearlyPlans.heading')}
            </Text>

            <Text style={paragraph}>
                {t('emails.features.yearlyPlans.description')}
            </Text>

            <Section style={buttonContainer}>
                <Button
                    href='https://clawhost.cloud'
                    style={button}
                >
                    {t('emails.features.yearlyPlans.cta')}
                </Button>
            </Section>
        </FeatureEmailLayout>
    )
}

export default YearlyPlansEmail