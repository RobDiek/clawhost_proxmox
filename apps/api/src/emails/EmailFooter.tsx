import type { CSSProperties, FC, ReactNode } from 'react'

import { t } from '@openclaw/i18n'
import { externalUrls } from '@openclaw/shared'
import { Link, Section, Text } from '@react-email/components'

import { paragraphMuted } from '@/lib/emailStyles'

const socialSection: CSSProperties = {
    textAlign: 'center',
    marginTop: '24px',
    marginBottom: '16px'
}

const socialLink = {
    color: '#8898aa',
    fontSize: '12px',
    textDecoration: 'none',
    margin: '0 8px'
}

const divider = {
    borderTop: '1px solid #e6e6e6',
    marginTop: '32px',
    paddingTop: '16px'
}

const EmailFooter: FC = (): ReactNode => {
    return (
        <Section style={divider}>
            <Section style={socialSection}>
                <Link href={externalUrls.SOCIAL.GITHUB} style={socialLink}>
                    {t('footer.ariaGithub')}
                </Link>
                <Link href={externalUrls.SOCIAL.X} style={socialLink}>
                    {t('footer.ariaX')}
                </Link>
                <Link href={externalUrls.SOCIAL.FACEBOOK} style={socialLink}>
                    {t('footer.ariaFacebook')}
                </Link>
                <Link href={externalUrls.SOCIAL.INSTAGRAM} style={socialLink}>
                    {t('footer.ariaInstagram')}
                </Link>
                <Link href={externalUrls.SOCIAL.THREADS} style={socialLink}>
                    {t('footer.ariaThreads')}
                </Link>
                <Link href={externalUrls.SOCIAL.YOUTUBE} style={socialLink}>
                    {t('footer.ariaYoutube')}
                </Link>
                <Link href={externalUrls.SOCIAL.TIKTOK} style={socialLink}>
                    {t('footer.ariaTiktok')}
                </Link>
            </Section>
        </Section>
    )
}

export default EmailFooter