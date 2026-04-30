// Marketing Intents — what a user is planning to invest in.
// Drives which Pipelines become available and which Integrations are essential.
// Decoupled from agents (an agent can serve multiple intents; a single intent
// can pull data from multiple integrations).

export type MarketingIntent =
    | 'paid_search'
    | 'paid_social'
    | 'seo'
    | 'content'
    | 'social_organic'
    | 'email_marketing'
    | 'ecommerce'
    | 'lead_generation'
    | 'brand_awareness'

export interface IntentInfo {
    id: MarketingIntent
    nameHe: string
    nameEn: string
    descHe: string
    icon: string
    category: 'acquisition' | 'organic' | 'retention' | 'commerce' | 'brand'
}

export const INTENTS: IntentInfo[] = [
    { id: 'paid_search',     nameHe: 'מודעות גוגל (Google Ads)', nameEn: 'Google Ads',        descHe: 'מודעות בתוצאות חיפוש, Display, YouTube, PMax',       icon: '',  category: 'acquisition' },
    { id: 'paid_social',     nameHe: 'מודעות ברשתות חברתיות',    nameEn: 'Paid Social',       descHe: 'Meta (Facebook/Instagram), TikTok, LinkedIn Ads',    icon: '',  category: 'acquisition' },
    { id: 'seo',             nameHe: 'SEO אורגני',                nameEn: 'SEO',               descHe: 'דירוג בתוצאות חיפוש אורגניות',                       icon: '',  category: 'organic' },
    { id: 'content',         nameHe: 'שיווק תוכן',                nameEn: 'Content Marketing', descHe: 'מאמרים, מדריכים, lead magnets',                      icon: '',  category: 'organic' },
    { id: 'social_organic',  nameHe: 'רשתות חברתיות אורגניות',   nameEn: 'Social Organic',    descHe: 'פרסום אורגני באינסטגרם / פייסבוק / לינקדאין',        icon: '',  category: 'organic' },
    { id: 'email_marketing', nameHe: 'דיוור (Email)',             nameEn: 'Email Marketing',   descHe: 'ניוזלטרים, אוטומציות, שימור לקוחות',                  icon: '',  category: 'retention' },
    { id: 'ecommerce',       nameHe: 'מסחר אונליין',              nameEn: 'E-Commerce',        descHe: 'קטלוג מוצרים, dynamic remarketing, abandoned cart',  icon: '',  category: 'commerce' },
    { id: 'lead_generation', nameHe: 'איסוף לידים',               nameEn: 'Lead Generation',   descHe: 'טפסים → CRM, מסעות לקוח, scoring',                   icon: '',  category: 'acquisition' },
    { id: 'brand_awareness', nameHe: 'מיתוג ומודעות',             nameEn: 'Brand Awareness',   descHe: 'חשיפה, וידאו, סיפור מותג',                           icon: '',  category: 'brand' },
]

export function getIntent(id: MarketingIntent): IntentInfo | undefined {
    return INTENTS.find(i => i.id === id)
}

export function isValidIntent(id: string): id is MarketingIntent {
    return INTENTS.some(i => i.id === id)
}
