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

const leftParagraph = { ...paragraph, textAlign: 'left' as const }
const leftHeading = { ...heading, textAlign: 'left' as const }
const leftSubheading = { ...subheading, textAlign: 'left' as const }

const SimplifiedPlatformEmail: FC = (): ReactNode => {
    return (
        <FeatureEmailLayout
            preview={t('emails.features.simplifiedPlatform.preview')}
        >
            <Text style={leftSubheading}>
                {t('emails.features.simplifiedPlatform.tag')}
            </Text>
            <Text style={leftHeading}>
                {t('emails.features.simplifiedPlatform.heading')}
            </Text>

            <Text style={leftParagraph}>
                {t('emails.features.simplifiedPlatform.description')}
            </Text>

            <Text style={leftParagraph}>
                {t('emails.features.simplifiedPlatform.why')}
            </Text>

            <Text style={leftParagraph}>
                {t('emails.features.simplifiedPlatform.benefit')}
            </Text>

            <Text style={leftParagraph}>
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