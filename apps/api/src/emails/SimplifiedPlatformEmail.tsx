import type { FC, ReactNode } from 'react'

import { t } from '@openclaw/i18n'
import { Button, Section, Text } from '@react-email/components'

import FeatureEmailLayout from '@/emails/FeatureEmailLayout'
import {
    subheading,
    heading,
    paragraph,
    button,
    buttonContainer
} from '@/lib/emailStyles'

const SimplifiedPlatformEmail: FC = (): ReactNode => {
    return (
        <FeatureEmailLayout
            preview={t('emails.features.simplifiedPlatform.preview')}
        >
            <Text style={subheading}>
                {t('emails.features.simplifiedPlatform.tag')}
            </Text>
            <Text style={heading}>
                {t('emails.features.simplifiedPlatform.heading')}
            </Text>

            <Text style={paragraph}>
                {t('emails.features.simplifiedPlatform.description')}
            </Text>

            <Text style={paragraph}>
                {t('emails.features.simplifiedPlatform.removed')}
            </Text>

            <Text style={paragraph}>
                {t('emails.features.simplifiedPlatform.why')}
            </Text>

            <Text style={paragraph}>
                {t('emails.features.simplifiedPlatform.benefit')}
            </Text>

            <Text style={paragraph}>
                {t('emails.features.simplifiedPlatform.action')}
            </Text>

            <Section style={buttonContainer}>
                <Button href='https://clawhost.cloud' style={button}>
                    {t('emails.features.simplifiedPlatform.cta')}
                </Button>
            </Section>
        </FeatureEmailLayout>
    )
}

export default SimplifiedPlatformEmail