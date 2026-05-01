import { t } from '@openclaw/i18n'

const getV2Stats = () => [
    {
        value: t('landing.startingPriceValue', { price: 25 }),
        label: t('landing.pricing')
    },
    { value: t('go.statsZero'), label: t('go.statsZeroConfig') },
    { value: t('v2.stats2Value'), label: t('v2.stats2Label') },
    { value: t('v2.stats3Value'), label: t('v2.stats3Label') },
    { value: t('v2.stats4Value'), label: t('v2.stats4Label') }
]

export default getV2Stats