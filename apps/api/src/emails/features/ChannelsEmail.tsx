import type { FC, ReactNode } from 'react'

import { t } from '@openclaw/i18n'
import { Button, Section, Text } from '@react-email/components'

import FeatureEmailLayout from '@/emails/features/FeatureEmailLayout'
import { heading, paragraph, button, buttonContainer } from '@/emails/styles'

const ChannelsEmail: FC = (): ReactNode => {
    return (
        <FeatureEmailLayout preview={t('emails.features.channels.preview')}>
            <Text style={heading}>{t('emails.features.channels.heading')}</Text>

            <Text style={paragraph}>
                {t('emails.features.channels.description')}
            </Text>

            <Section style={buttonContainer}>
                <Button href='https://clawhost.cloud' style={button}>
                    {t('emails.features.channels.cta')}
                </Button>
            </Section>
        </FeatureEmailLayout>
    )
}

export default ChannelsEmail