import type { FC, ReactNode } from 'react'

import { t } from '@openclaw/i18n'
import { Button, Section, Text } from '@react-email/components'

import FeatureEmailLayout from '@/emails/features/FeatureEmailLayout'
import { heading, paragraph, button, buttonContainer } from '@/emails/styles'

const FileExplorerEmail: FC = (): ReactNode => {
    return (
        <FeatureEmailLayout preview={t('emails.features.fileExplorer.preview')}>
            <Text style={heading}>
                {t('emails.features.fileExplorer.heading')}
            </Text>

            <Text style={paragraph}>
                {t('emails.features.fileExplorer.description')}
            </Text>

            <Section style={buttonContainer}>
                <Button
                    href='https://clawhost.cloud'
                    style={button}
                >
                    {t('emails.features.fileExplorer.cta')}
                </Button>
            </Section>
        </FeatureEmailLayout>
    )
}

export default FileExplorerEmail