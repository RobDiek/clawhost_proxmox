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
    { id: 'mt', nameHe: 'MATEH — סוכן שיווקי', nameEn: 'MATEH — Marketing Agent', ram: 4.0, category: 'agent', available: true },
    { id: 'sv', nameHe: 'נציג מכירות ותמיכה', nameEn: 'Sales & Support Agent', ram: 2.0, category: 'agent', available: false },
    { id: 'ec', nameHe: 'eCommerce Agent', nameEn: 'eCommerce Agent', ram: 2.0, category: 'agent', available: false },
    { id: 'n8', nameHe: 'n8n', nameEn: 'n8n', ram: 0.5, category: 'automation', available: true },
    { id: 'ap', nameHe: 'Activepieces', nameEn: 'Activepieces', ram: 0.5, category: 'automation', available: true },
    { id: 'df', nameHe: 'Dify AI Studio', nameEn: 'Dify AI Studio', ram: 1.0, category: 'automation', available: true },
    { id: 'ol', nameHe: 'Ollama (מודל מקומי)', nameEn: 'Ollama (Local Model)', ram: 8.0, category: 'ai', available: true },
]

const ADDONS = [
    { id: 'backup', nameHe: 'גיבוי יומי', nameEn: 'Daily Backup', priceIls: 19, ram: 0 },
    { id: 'storage_20', nameHe: 'אחסון +20GB', nameEn: 'Storage +20GB', priceIls: 9, ram: 0 },
    { id: 'storage_100', nameHe: 'אחסון +100GB', nameEn: 'Storage +100GB', priceIls: 39, ram: 0 },
    { id: 'storage_500', nameHe: 'אחסון +500GB', nameEn: 'Storage +500GB', priceIls: 199, ram: 0 },
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

export { PLANS, COMPONENTS, ADDONS }
