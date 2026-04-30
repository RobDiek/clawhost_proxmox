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
    { id: 'storage_20', nameHe: 'אחסון +20GB', nameEn: 'Storage +20GB', priceIls: 15, ram: 0 },
    { id: 'storage_100', nameHe: 'אחסון +100GB', nameEn: 'Storage +100GB', priceIls: 49, ram: 0 },
    { id: 'storage_500', nameHe: 'אחסון +500GB', nameEn: 'Storage +500GB', priceIls: 149, ram: 0 },
]

// HaaS (Human as a Service) — marketing management subscription tiers.
// Canonical pricing lives here + rendered on /auto-pilot landing page.
// null tier = self-service (no HaaS, user does everything themselves).
export interface HaasTier {
    id: 'self_service' | 'configuration' | 'autopilot'
    nameHe: string
    nameEn: string
    priceIls: number          // monthly (0 for one-time tiers)
    setupIls: number          // one-time setup fee
    minMonths?: number        // minimum commitment in months
    badge: 'gray' | 'blue' | 'purple'
    featured?: boolean
    adsMode: 'self' | 'all_channels'
    features: string[]
}

const HAAS_TIERS: HaasTier[] = [
    {
        id: 'self_service',
        nameHe: 'Self-Service',
        nameEn: 'Self-Service',
        priceIls: 139,           // MATEH-only, fully self-managed
        setupIls: 0,
        badge: 'gray',
        adsMode: 'self',
        features: [
            'MATEH — סוכן השיווק המלא, פעיל מהיום הראשון',
            '10 סוכני AI מותקנים ומוכנים להפעלה',
            'גישה מלאה ופתוחה ללוח הבקרה — כל הכלים, כל התכונות',
            'חיבורים אפשריים: Google Ads · Meta Ads · GA4 · Search Console · GTM · WhatsApp · Telegram · Gmail · Calendar',
            'הגדרת אסטרטגיה, קמפיינים ותוכן — אתם מובילים',
            'מפתחות API שלכם · שליטה מלאה ב-prompts ובהגדרות',
            'VPS עצמאי משלכם, עם SSL ודומיין ייחודי',
            'תמיכה טכנית במייל',
            'ללא דמי הקמה · ביטול בכל עת',
        ],
    },
    {
        id: 'configuration',
        nameHe: 'תצורה',
        nameEn: 'Configuration',
        priceIls: 0,           // one-time only
        setupIls: 1750,
        badge: 'blue',
        featured: true,
        adsMode: 'self',
        features: [
            'שיחת גילוי (60 דקות, זום)',
            'בניית Brand Foundation מלא — צבעים, פונטים, לוגו, voice',
            'SEO — מחקר מילות מפתח, ניתוח מתחרים, אסטרטגיית תוכן ל-3 חודשים',
            'Google Ads — חיבור Ads/GA4/GSC/GTM, Mazhir Audit, קמפיינים ראשוניים',
            'Meta Ads — חיבור Facebook + Instagram, Lookalike audiences, קמפיין ראשון',
            'חיבור ערוצי לקוחות — Telegram, WhatsApp, Gmail, Calendar',
            'מסירה והדרכה (90 דקות זום)',
            '30 ימי תמיכה במייל אחרי המסירה',
            'בסוף ההקמה: 10 סוכני AI מבצעים את האסטרטגיה החודשית באופן עצמאי. אתם רק מאשרים תוכן ומדיה',
            'לאחר המסירה — אתם בשליטה, ללא דמי ניהול',
        ],
    },
    {
        id: 'autopilot',
        nameHe: 'אוטופילוט',
        nameEn: 'Auto-pilot',
        priceIls: 1500,
        setupIls: 1750,
        minMonths: 6,
        badge: 'purple',
        adsMode: 'all_channels',
        features: [
            'הכל מ-"תצורה" (תהליך הקמה מלא)',
            'דוח שבועי כל יום ראשון בשעה 09:00 (PDF + סיכום בטלגרם)',
            'פרסום ממומן — ניהול מלא (Google + Meta + YouTube), אופטימיזציה שבועית',
            'תוכן אורגני — 4–8 מאמרי SEO לחודש + 3–5 פוסטים שבועיים',
            'רשימות תפוצה — ניוזלטר + Email automations + A/B שבועי',
            'קריאייטיב — עד 16 יצירות מדיה לחודש (תמונות + וידאו)',
            'ניהול לקוחות — WhatsApp + Google Business Profile (פוסטים ומענה לביקורות)',
            'שיחת אסטרטגיה דו-שבועית (30 דקות, זום)',
            'מינימום התחייבות 6 חודשים, חודש הודעה מראש לביטול',
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
