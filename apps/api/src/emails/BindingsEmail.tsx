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

const BindingsEmail: FC = (): ReactNode => {
    return (
        <FeatureEmailLayout preview={t('emails.features.bindings.preview')}>
            <Text style={subheading}>{t('emails.features.bindings.tag')}</Text>
            <Text style={heading}>{t('emails.features.bindings.heading')}</Text>

            <Text style={paragraph}>
                {t('emails.features.bindings.description')}
            </Text>

            <Section style={featureGifSection}>
                <Img
                    src={CDN_ASSETS.FEATURE_BINDINGS}
                    width='560'
                    alt={t('emails.features.bindings.tag')}
                    style={featureGif}
                />
            </Section>

            <Section style={buttonContainer}>
                <Button href='https://clawhost.cloud' style={button}>
                    {t('emails.features.bindings.cta')}
                </Button>
            </Section>
        </FeatureEmailLayout>
    )
}

export default BindingsEmail