import type { Faq } from '@/ts/Interfaces'

import { t } from '@openclaw/i18n'

const getV2Faqs = (): Faq[] => [
    { question: t('v2.faq1Question'), answer: t('v2.faq1Answer') },
    { question: t('v2.faq2Question'), answer: t('v2.faq2Answer') },
    { question: t('v2.faq3Question'), answer: t('v2.faq3Answer') },
    { question: t('v2.faq4Question'), answer: t('v2.faq4Answer') },
    { question: t('v2.faq5Question'), answer: t('v2.faq5Answer') },
    { question: t('v2.faq6Question'), answer: t('v2.faq6Answer') },
    { question: t('v2.faq7Question'), answer: t('v2.faq7Answer') }
]

export default getV2Faqs