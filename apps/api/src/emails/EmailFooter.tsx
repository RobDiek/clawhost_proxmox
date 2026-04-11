import type { FC, ReactNode } from 'react'

import { t } from '@openclaw/i18n'
import { externalUrls } from '@openclaw/shared'
import { Img, Link, Section, Text } from '@react-email/components'

import CDN_ASSETS from '@/lib/cdn'
import { paragraphMuted } from '@/lib/emailStyles'

const socialSection = {
    textAlign: 'center' as const,
    marginTop: '24px',
    marginBottom: '16px'
}

const socialIcon = {
    display: 'inline-block' as const,
    margin: '0 6px',
    borderRadius: '50%',
    backgroundColor: '#2a2a2a',
    width: '32px',
    height: '32px',
    textAlign: 'center' as const,
    lineHeight: '32px'
}

const socialImg = {
    width: '16px',
    height: '16px'
}

const divider = {
    borderTop: '1px solid #e6e6e6',
    marginTop: '24px',
    paddingTop: '20px'
}

const EmailFooter: FC = (): ReactNode => {
    return (
        <Section style={divider}>
            <Section style={socialSection}>
                <Link href={externalUrls.SOCIAL.PRODUCT_HUNT} style={socialIcon}>
                    <Img src={CDN_ASSETS.ICON_PRODUCT_HUNT} width='16' height='16' alt='Product Hunt' style={socialImg} />
                </Link>
                <Link href={externalUrls.SOCIAL.X} style={socialIcon}>
                    <Img src={CDN_ASSETS.ICON_X} width='16' height='16' alt='X' style={socialImg} />
                </Link>
                <Link href={externalUrls.SOCIAL.FACEBOOK} style={socialIcon}>
                    <Img src={CDN_ASSETS.ICON_FACEBOOK} width='16' height='16' alt='Facebook' style={socialImg} />
                </Link>
                <Link href={externalUrls.SOCIAL.INSTAGRAM} style={socialIcon}>
                    <Img src={CDN_ASSETS.ICON_INSTAGRAM} width='16' height='16' alt='Instagram' style={socialImg} />
                </Link>
                <Link href={externalUrls.SOCIAL.THREADS} style={socialIcon}>
                    <Img src={CDN_ASSETS.ICON_THREADS} width='16' height='16' alt='Threads' style={socialImg} />
                </Link>
                <Link href={externalUrls.SOCIAL.YOUTUBE} style={socialIcon}>
                    <Img src={CDN_ASSETS.ICON_YOUTUBE} width='16' height='16' alt='YouTube' style={socialImg} />
                </Link>
                <Link href={externalUrls.SOCIAL.TIKTOK} style={socialIcon}>
                    <Img src={CDN_ASSETS.ICON_TIKTOK} width='16' height='16' alt='TikTok' style={socialImg} />
                </Link>
            </Section>

            <Text style={paragraphMuted}>
                {t('emails.featureFooter')}
            </Text>
        </Section>
    )
}

export default EmailFooter