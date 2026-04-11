import type { FC, ReactNode } from 'react'
import type { FeatureEmailLayoutProps } from '@/ts/Interfaces'

import { t } from '@openclaw/i18n'
import {
    Body,
    Container,
    Html,
    Img,
    Link,
    Preview,
    Section,
    Text
} from '@react-email/components'

import { externalUrls } from '@openclaw/shared'
import CDN_ASSETS from '@/lib/cdn'
import EmailFooter from '@/emails/EmailFooter'
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
                        <Link href={externalUrls.CLAWHOST.BASE}>
                            <Img
                                src={CDN_ASSETS.LOGO_DARK}
                                width='140'
                                alt='ClawHost'
                                style={logo}
                            />
                        </Link>
                    </Section>

                    <Section style={body}>
                        {children}

                        <EmailFooter />
                    </Section>
                </Container>

                <Text style={{ ...paragraphMuted, marginTop: '-18px' }}>
                    {t('emails.featureFooter')}
                </Text>
            </Body>
        </Html>
    )
}

export default FeatureEmailLayout