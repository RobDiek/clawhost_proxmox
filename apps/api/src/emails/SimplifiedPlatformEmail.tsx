import type { CSSProperties, FC, ReactNode } from 'react'

import { t } from '@openclaw/i18n'
import { Button, Img, Section, Text } from '@react-email/components'

import CDN_ASSETS from '@/lib/cdn'
import FeatureEmailLayout from '@/emails/FeatureEmailLayout'

import {
    heading,
    paragraph,
    button,
    buttonContainer,
    featureGifSection,
    featureGif
} from '@/lib/emailStyles'

const leftParagraph: CSSProperties = { ...paragraph, textAlign: 'left' }

const SimplifiedPlatformEmail: FC = (): ReactNode => {
    return (
        <FeatureEmailLayout
            preview={t('emails.features.simplifiedPlatform.preview')}
        >
            <Text style={heading}>
                {t('emails.features.simplifiedPlatform.heading')}
            </Text>

            <Section style={featureGifSection}>
                <Img
                    src={CDN_ASSETS.EMAIL_SIMPLIFIED_PLATFORM}
                    width='560'
                    alt={t('emails.features.simplifiedPlatform.heading')}
                    style={featureGif}
                />
            </Section>

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

            <Text style={leftParagraph}>
                {t('emails.features.simplifiedPlatform.closing')}
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