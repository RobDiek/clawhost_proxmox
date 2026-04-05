import type { FC, ReactNode } from 'react'
import type { FeatureEmailLayoutProps } from '@/ts/Interfaces'

import { t } from '@openclaw/i18n'

import {
    Body,
    Container,
    Html,
    Img,
    Preview,
    Section,
    Text
} from '@react-email/components'

import CDN_ASSETS from '@/lib/cdn'
import {
    main,
    container,
    body,
    paragraphMuted,
    logoSection,
    logo
} from '@/lib/emailStyles'

const FeatureEmailLayout: FC<FeatureEmailLayoutProps> = ({
    preview,
    children
}): ReactNode => {
    return (
        <Html>
            <Preview>{preview}</Preview>

            <Body style={main}>
                <Container style={container}>
                    <Section style={logoSection}>
                        <Img
                            src={CDN_ASSETS.LOGO_DARK}
                            width='140'
                            alt='ClawHost'
                            style={logo}
                        />
                    </Section>

                    <Section style={body}>
                        {children}

                        <Text style={paragraphMuted}>
                            {t('emails.featureFooter')}
                        </Text>
                    </Section>
                </Container>
            </Body>
        </Html>
    )
}

export default FeatureEmailLayout