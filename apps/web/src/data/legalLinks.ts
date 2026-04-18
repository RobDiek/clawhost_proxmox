import type { FooterLink } from '@/ts/Interfaces'

import { t } from '@openclaw/i18n'
import { ROUTES } from '@/lib'
import { SUPPORT_EMAIL } from '@/lib/links'

const getLegalLinks = (): FooterLink[] => [
    { label: t('footer.privacyPolicy'), href: ROUTES.PRIVACY },
    { label: t('footer.termsOfService'), href: ROUTES.TERMS },
    { label: t('footer.compare'), href: ROUTES.COMPARE },
    { label: t('footer.changelog'), href: ROUTES.CHANGELOG },
    { label: t('footer.getInTouch'), href: `mailto:${SUPPORT_EMAIL}` }
]

export default getLegalLinks