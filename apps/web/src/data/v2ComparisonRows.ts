import { t } from '@openclaw/i18n'

const getV2ComparisonRows = () => [
    { us: t('v2.comparisonUsLabel'), others: t('v2.comparisonOthersLabel') },
    { us: t('v2.comparisonAgentAccessUs'), others: t('landing.comparisonOpenClawOthers') },
    { us: t('landing.comparisonPricingUs'), others: t('landing.comparisonPricingOthers') },
    { us: t('landing.comparisonOwnershipUs'), others: t('landing.comparisonOwnershipOthers') },
    { us: t('landing.comparisonSubdomainUs'), others: t('landing.comparisonSubdomainOthers') },
    { us: t('landing.comparisonInfraUs'), others: t('landing.comparisonInfraOthers') },
    { us: t('landing.comparisonDataUs'), others: t('landing.comparisonDataOthers') },
    { us: t('v2.comparisonMultipleAgentsUs'), others: t('v2.comparisonMultipleAgentsOthers') },
    { us: t('landing.comparisonOpenSourceUs'), others: t('landing.comparisonOpenSourceOthers') },
    { us: t('v2.comparisonExportAgentsUs'), others: t('landing.comparisonExportOthers') },
    { us: t('landing.comparisonProvidersUs'), others: t('landing.comparisonProvidersOthers') },
    { us: t('landing.comparisonVersionUs'), others: t('landing.comparisonVersionOthers') },
    { us: t('landing.comparisonTerminalUs'), others: t('landing.comparisonTerminalOthers') }
]

export default getV2ComparisonRows