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

const EnvVarsEmail: FC = (): ReactNode => {
    return (
        <FeatureEmailLayout preview={t('emails.features.envVars.preview')}>
            <Text style={subheading}>{t('emails.features.envVars.tag')}</Text>
            <Text style={heading}>{t('emails.features.envVars.heading')}</Text>

            <Text style={paragraph}>
                {t('emails.features.envVars.description')}
            </Text>

            <Section style={featureGifSection}>
                <Img
                    src={CDN_ASSETS.FEATURE_ENV_VARS}
                    width='560'
                    alt={t('emails.features.envVars.tag')}
                    style={featureGif}
                />
            </Section>

            <Section style={buttonContainer}>
                <Button href='https://clawhost.cloud' style={button}>
                    {t('emails.features.envVars.cta')}
                </Button>
            </Section>
        </FeatureEmailLayout>
    )
}

export default EnvVarsEmail