import type { FC, ReactNode } from 'react'

import { t } from '@openclaw/i18n'
import { Button, Img, Section, Text } from '@react-email/components'

import CDN_ASSETS from '@/lib/cdn'
import FeatureEmailLayout from '@/emails/FeatureEmailLayout'
import {
    subheading,
    heading,
    paragraph,
    button,
    buttonContainer,
    featureGifSection,
    featureGif
} from '@/lib/emailStyles'

const VoiceModeEmail: FC = (): ReactNode => {
    return (
        <FeatureEmailLayout preview={t('emails.features.voiceMode.preview')}>
            <Text style={subheading}>{t('emails.features.voiceMode.tag')}</Text>
            <Text style={heading}>
                {t('emails.features.voiceMode.heading')}
            </Text>

            <Text style={paragraph}>
                {t('emails.features.voiceMode.description')}
            </Text>

            <Section style={featureGifSection}>
                <Img
                    src={CDN_ASSETS.FEATURE_VOICE_MODE}
                    width='560'
                    alt={t('emails.features.voiceMode.tag')}
                    style={featureGif}
                />
            </Section>

            <Section style={buttonContainer}>
                <Button href='https://clawhost.cloud' style={button}>
                    {t('emails.features.voiceMode.cta')}
                </Button>
            </Section>
        </FeatureEmailLayout>
    )
}

export default VoiceModeEmail