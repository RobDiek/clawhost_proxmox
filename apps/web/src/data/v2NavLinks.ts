import { t } from '@openclaw/i18n'
import { ROUTES } from '@/lib'

const getV2NavLinks = () => [
    { label: 'Cloud', href: ROUTES.V2, id: 'cloud' },
    { label: 'Go', href: ROUTES.GO, id: 'go' },
    { label: t('landing.features'), href: ROUTES.FEATURES, id: 'features' },
    { label: t('landing.pricing'), href: ROUTES.PRICING, id: 'pricing' },
    { label: t('landing.comparison'), href: ROUTES.COMPARE, id: 'comparison' }
]

export default getV2NavLinks