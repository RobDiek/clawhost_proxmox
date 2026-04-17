export interface PlanInfo {
    key: string
    nameHe: string
    nameEn: string
    ram: number
    cpu: number
    cpuType: 'shared' | 'dedicated'
    nvme: number
    hetznerType: string
    priceIls: number
}

export interface ComponentInfo {
    id: string
    nameHe: string
    nameEn: string
    ram: number
    category: 'agent' | 'automation' | 'ai' | 'addon'
    available: boolean
}

const PLANS: PlanInfo[] = [
    { key: 'personal', nameHe: 'אישי', nameEn: 'Personal', ram: 4, cpu: 2, cpuType: 'shared', nvme: 40, hetznerType: 'cx23', priceIls: 79 },
    { key: 'business', nameHe: 'עסקי', nameEn: 'Business', ram: 8, cpu: 4, cpuType: 'shared', nvme: 80, hetznerType: 'cx33', priceIls: 169 },
    { key: 'pro', nameHe: 'פרו', nameEn: 'Pro', ram: 16, cpu: 4, cpuType: 'dedicated', nvme: 160, hetznerType: 'ccx23', priceIls: 349 },
    { key: 'developer', nameHe: 'מפתח', nameEn: 'Developer', ram: 32, cpu: 8, cpuType: 'dedicated', nvme: 240, hetznerType: 'ccx33', priceIls: 599 },
]

const COMPONENTS: ComponentInfo[] = [
    { id: 'oc', nameHe: 'OpenClaw Personal', nameEn: 'OpenClaw Personal', ram: 1.0, category: 'agent', available: true },
    { id: 'bare', nameHe: 'OpenClaw נקי', nameEn: 'OpenClaw Bare', ram: 0.5, category: 'agent', available: true },
    { id: 'mt', nameHe: 'MATEH — סוכן שיווקי', nameEn: 'MATEH — Marketing Agent', ram: 5.5, category: 'agent', available: true },
    { id: 'sv', nameHe: 'נציג מכירות ותמיכה', nameEn: 'Sales & Support Agent', ram: 2.0, category: 'agent', available: false },
    { id: 'ec', nameHe: 'eCommerce Agent', nameEn: 'eCommerce Agent', ram: 2.0, category: 'agent', available: false },
    { id: 'ap', nameHe: 'Activepieces', nameEn: 'Activepieces', ram: 0.5, category: 'automation', available: true },
    { id: 'ol', nameHe: 'Ollama (מודל מקומי)', nameEn: 'Ollama (Local Model)', ram: 8.0, category: 'ai', available: true },
    // n8n removed — Sustainable Use License prohibits managed hosting
    // Dify removed — Modified Apache 2.0 prohibits multi-tenant SaaS
    // Twenty CRM removed — AGPLv3 copyleft risk
]

const ADDONS = [
    { id: 'backup', nameHe: 'גיבוי יומי', nameEn: 'Daily Backup', priceIls: 19, ram: 0 },
    { id: 'storage_20', nameHe: 'אחסון +20GB', nameEn: 'Storage +20GB', priceIls: 9, ram: 0 },
    { id: 'storage_100', nameHe: 'אחסון +100GB', nameEn: 'Storage +100GB', priceIls: 39, ram: 0 },
    { id: 'storage_500', nameHe: 'אחסון +500GB', nameEn: 'Storage +500GB', priceIls: 199, ram: 0 },
]

// HaaS (Human as a Service) — marketing management subscription tiers.
// Canonical pricing lives here + rendered on /auto-pilot landing page.
// null tier = self-service (no HaaS, user does everything themselves).
export interface HaasTier {
    id: 'starter' | 'growth' | 'autopilot'
    nameHe: string
    nameEn: string
    priceIls: number         // monthly
    setupIls: number         // one-time
    badge: 'green' | 'blue' | 'purple'
    featured?: boolean        // 'recommended' label
    adsMode: 'self' | 'one_channel' | 'all_channels'   // managed-ads capability
    features: string[]
}

const HAAS_TIERS: HaasTier[] = [
    {
        id: 'starter',
        nameHe: 'סטארטר',
        nameEn: 'Starter',
        priceIls: 299,
        setupIls: 500,
        badge: 'green',
        adsMode: 'self',
        features: [
            'סקירה שבועית של פלטי סוכנים',
            'אישור ועריכת תוכן לפני פרסום',
            'דוח SEO + ביצועים חודשי',
            'תמיכה בטלגרם (24 שעות בימי עסקים)',
            'תיקוני באגים',
            'אינטגרציה עם כלי SEO (Google Search, DataForSEO, Firecrawl)',
            'יצירת תוכן חדש',
            'ניהול פרסום ממומן (self-hosted)',
        ],
    },
    {
        id: 'growth',
        nameHe: 'גרוס',
        nameEn: 'Growth',
        priceIls: 699,
        setupIls: 1200,
        badge: 'blue',
        featured: true,
        adsMode: 'one_channel',
        features: [
            'כל מה שיש ב-Starter',
            'מחקר SEO + אסטרטגיה חודשית',
            'עד 4 מאמרים לחודש (עם Schema, AI Nuggets, Entity Consensus)',
            'הקמת קמפיינים ממומנים (Meta / Google Ads — ערוץ אחד מנוהל)',
            'עד 8 יצירות מדיה לחודש (AI — תמונות/וידאו)',
            'אופטימיזציית מודעות שבועית',
            'התאמת Prompt Engineering',
            'שיחת Zoom של 20 דקות אחת לשבועיים',
        ],
    },
    {
        id: 'autopilot',
        nameHe: 'אוטופילוט',
        nameEn: 'Autopilot',
        priceIls: 1499,
        setupIls: 2000,
        badge: 'purple',
        adsMode: 'all_channels',
        features: [
            'כל מה שיש ב-Growth',
            'עד 8 מאמרי SEO לחודש',
            'עד 16 יצירות מדיה לחודש',
            'ניהול רשתות חברתיות (LinkedIn, Facebook, Instagram) — 3-5 פוסטים/שבוע',
            'ניטור תחרותי + תגובה תוך 24 שעות',
            'עד 2 דפי נחיתה לחודש',
            'שיחה שבועית של 30 דקות עם מנהל חשבון',
            'דוח ROAS / ROI מפורט',
            'ניהול כל ערוצי הפרסום הממומן (Meta + Google + LinkedIn + TikTok כשזמין)',
        ],
    },
]

const BASE_RAM = 0.5

export function calcPlan(componentIds: string[]): {
    planKey: string
    ramNeeded: number
    priceIls: number
    plan: PlanInfo
} {
    const ramNeeded = componentIds.reduce((sum, id) => {
        const comp = COMPONENTS.find(c => c.id === id)
        return sum + (comp ? comp.ram : 0)
    }, BASE_RAM)

    const plan = PLANS.find(p => p.ram >= ramNeeded) || PLANS[PLANS.length - 1]

    return {
        planKey: plan.key,
        ramNeeded,
        priceIls: plan.priceIls,
        plan
    }
}

export function calcTotal(componentIds: string[], addonIds: string[]): {
    planKey: string
    ramNeeded: number
    planPrice: number
    addonsPrice: number
    totalPrice: number
    plan: PlanInfo
} {
    const { planKey, ramNeeded, priceIls, plan } = calcPlan(componentIds)

    const addonsPrice = addonIds.reduce((sum, id) => {
        const addon = ADDONS.find(a => a.id === id)
        return sum + (addon ? addon.priceIls : 0)
    }, 0)

    return {
        planKey,
        ramNeeded,
        planPrice: priceIls,
        addonsPrice,
        totalPrice: priceIls + addonsPrice,
        plan
    }
}

export const INSTALLMENTS: Record<string, number> = {
    personal: 3,
    business: 6,
    pro: 6,
    developer: 12,
}

export { PLANS, COMPONENTS, ADDONS, HAAS_TIERS }
