/**
 * Phase 2.3.H — Integration gate for research/strategy stages.
 *
 * Centralizes the rules: "to run X, the user MUST have Y connected".
 * Replaces ad-hoc per-stage failure messages with a unified pre-flight
 * + run-time guard that produces actionable Hebrew checklists.
 *
 * Three sources of requirements:
 *   1. STAGE_REQUIREMENTS — what each pipeline stage needs to function.
 *   2. PROFILE_REQUIREMENTS — based on the user's business profile
 *      (businessModel, marketingGoals, platforms, conversionMechanism).
 *   3. UNIVERSAL — always required (AI key + a website URL).
 *
 * Used by:
 *   - GET /research/preflight (UI checklist)
 *   - _runStageGeneric.ts pre-run guard (defense-in-depth, blocks
 *     direct API calls that would burn DFS budget on a misconfigured agent)
 *
 * Per-agent: integration status comes from the active mateh_agent
 * (Phase 2.3.E overlay), not the bare instance row.
 */

import type { StageId } from './types'
import type { MatehAgentRow, InstanceRow } from '@/services/agentContext'

export type IntegrationId =
    | 'ai_key'           // any AI provider key (anthropic/openai/groq/cerebras)
    | 'website_url'      // answer.websiteUrl set
    | 'gsc'              // Google Search Console
    | 'dataforseo'       // DataForSEO API key
    | 'firecrawl'        // Firecrawl API key
    | 'google_workspace' // Google OAuth (Workspace / GA4 / GTM)
    | 'google_ads'       // Google Ads scope on the Google OAuth
    | 'meta_ads'         // Meta (Facebook/Instagram) tokens
    | 'github'           // GitHub for content publishing
    | 'gbp'              // Google Business Profile (local)
    | 'business_profile' // researchData.answers populated (name + desc)

export type Requirement = {
    id: IntegrationId
    severity: 'mandatory' | 'recommended' | 'optional'
    label_he: string
    /** Why this matters — shown to user next to the requirement. */
    valueProp_he: string
    /** Frontend route hint to deep-link the user into the connect flow. */
    deepLink: string
}

export type RequirementWithStatus = Requirement & {
    status: 'connected' | 'missing'
}

const REGISTRY: Record<IntegrationId, Omit<Requirement, 'severity'>> = {
    ai_key: {
        id: 'ai_key',
        label_he: 'מפתח AI (Anthropic / OpenAI / Groq / Cerebras)',
        valueProp_he: 'בלי מפתח AI אף שלב לא ירוץ — כל המחקר וההצעות מבוססים על LLM.',
        deepLink: 'integrations#anthropic',
    },
    website_url: {
        id: 'website_url',
        label_he: 'כתובת האתר',
        valueProp_he: 'בלי URL לא נוכל לסרוק את האתר ל-internal SEO audit, להוציא קטגוריות מוצרים (eCommerce), או לבנות profile של competitor landscape.',
        deepLink: 'agents#profile',
    },
    business_profile: {
        id: 'business_profile',
        label_he: 'פרופיל עסקי מלא',
        valueProp_he: 'businessName + תיאור 50+ תווים + סוג עסק + מטרות שיווק. בלי זה האסטרטגיה תהיה גנרית.',
        deepLink: 'agents#profile',
    },
    gsc: {
        id: 'gsc',
        label_he: 'Google Search Console',
        valueProp_he: 'נותן את ה-queries האמיתיות שמביאות לכם traffic, position, CTR. בלי GSC keyword research מבוסס על AI guess + DFS estimation במקום Google data שלכם.',
        deepLink: 'integrations#gsc',
    },
    dataforseo: {
        id: 'dataforseo',
        label_he: 'DataForSEO',
        valueProp_he: 'מקור הנתונים העיקרי ל-keyword volume, KD, SERP, AI Visibility, backlinks. בלעדיו רוב המחקר מבוסס על השערות.',
        deepLink: 'integrations#dataforseo',
    },
    firecrawl: {
        id: 'firecrawl',
        label_he: 'Firecrawl',
        valueProp_he: 'דרוש ל-internal_seo_audit ול-deep crawl של money pages של מתחרים. בלעדיו audit ירוץ במצב מוגבל (Crawl4AI fallback).',
        deepLink: 'integrations#firecrawl',
    },
    google_workspace: {
        id: 'google_workspace',
        label_he: 'Google Workspace (GA4 / GTM)',
        valueProp_he: 'GA4 → conversion data לחישוב ROAS אמיתי. GTM → המלצות tracking ומיפוי events.',
        deepLink: 'integrations#google',
    },
    google_ads: {
        id: 'google_ads',
        label_he: 'Google Ads',
        valueProp_he: 'נדרש ל-paid_audit + media_plan עם calibrated CPC/conversion rate במקום generic baselines.',
        deepLink: 'integrations#google',
    },
    meta_ads: {
        id: 'meta_ads',
        label_he: 'Meta Ads (Facebook / Instagram)',
        valueProp_he: 'נדרש ל-paid_audit + media_plan + retargeting strategy. ל-Instagram publishing אפשר לפרסם רק עם חיבור.',
        deepLink: 'integrations#meta',
    },
    github: {
        id: 'github',
        label_he: 'GitHub',
        valueProp_he: 'אופציונלי — לפרסום אוטומטי של מאמרי בלוג שנוצרו על-ידי הסוכן ל-repo של האתר (Cloudflare Pages / Vercel / Netlify).',
        deepLink: 'integrations#github',
    },
    gbp: {
        id: 'gbp',
        label_he: 'Google Business Profile',
        valueProp_he: 'קריטי לעסק מקומי — local pack ranking, reviews monitoring, posts scheduling. בלעדיו local SEO לא רץ.',
        deepLink: 'integrations#gbp',
    },
}

// ─────────────────────────────────────────────────────────────────────
// Stage-level requirements (what each pipeline stage NEEDS to run)
// ─────────────────────────────────────────────────────────────────────
const STAGE_REQUIREMENTS: Partial<Record<StageId, {
    mandatory: IntegrationId[]
    recommended: IntegrationId[]
}>> = {
    competitor_landscape: {
        mandatory: ['ai_key', 'website_url'],
        recommended: ['dataforseo', 'firecrawl'],
    },
    seo_keyword_research: {
        mandatory: ['ai_key', 'dataforseo'],
        recommended: ['gsc'],
    },
    audience_personas: {
        mandatory: ['ai_key', 'business_profile'],
        recommended: ['gsc'],
    },
    link_audit: {
        mandatory: ['ai_key', 'dataforseo', 'website_url'],
        recommended: [],
    },
    internal_seo_audit: {
        mandatory: ['ai_key', 'website_url'],
        recommended: ['firecrawl', 'gsc'],
    },
    aeo_visibility: {
        mandatory: ['ai_key', 'dataforseo', 'business_profile'],
        recommended: [],
    },
    cost_timeline_modeling: {
        mandatory: ['ai_key', 'dataforseo', 'business_profile'],
        recommended: ['google_ads', 'meta_ads'],
    },
    paid_audit: {
        mandatory: ['ai_key'],
        recommended: ['google_ads', 'meta_ads', 'google_workspace'],
    },
    validation: {
        mandatory: ['ai_key', 'business_profile'],
        recommended: [],
    },
    strategy_options: {
        mandatory: ['ai_key', 'business_profile'],
        recommended: [],
    },
    content_plan: {
        mandatory: ['ai_key'],
        recommended: ['gsc'],
    },
    media_plan: {
        mandatory: ['ai_key'],
        recommended: ['google_ads', 'meta_ads', 'google_workspace'],
    },
}

// ─────────────────────────────────────────────────────────────────────
// Profile-derived requirements (what the BUSINESS profile implies)
// ─────────────────────────────────────────────────────────────────────
type Answers = {
    businessName?: string
    businessDescription?: string
    websiteUrl?: string
    businessModel?: string
    geography?: string
    conversionMechanism?: string
    marketingGoals?: string
    platforms?: string
}

export function deriveProfileRequirements(answers: Answers): {
    mandatory: IntegrationId[]
    recommended: IntegrationId[]
} {
    const mandatory = new Set<IntegrationId>(['ai_key', 'website_url', 'business_profile'])
    const recommended = new Set<IntegrationId>(['dataforseo', 'gsc'])

    const goals = (answers.marketingGoals || '').toLowerCase()
    const platforms = (answers.platforms || '').toLowerCase()
    const conv = (answers.conversionMechanism || '').toLowerCase()
    const model = answers.businessModel || ''

    // SEO goal → GSC + DataForSEO mandatory
    if (goals.includes('seo') || goals.includes('אורגני')) {
        mandatory.add('gsc')
        mandatory.add('dataforseo')
        recommended.add('firecrawl')
    }

    // Sales goal → at least one ad platform recommended (mandatory if "מכירות ישירות")
    if (goals.includes('מכירות ישירות') || goals.includes('לידים')) {
        // At least one of Meta/Google should be available — keep both as
        // strongly-recommended (we'll surface a "choose at least one" UI hint).
        recommended.add('google_ads')
        recommended.add('meta_ads')
    }

    // Platform-specific
    if (platforms.includes('instagram') || platforms.includes('facebook') || platforms.includes('meta')) {
        recommended.add('meta_ads')
    }
    if (platforms.includes('google ads')) {
        recommended.add('google_ads')
    }

    // Business-model branches
    switch (model) {
        case 'ecommerce':
            recommended.add('meta_ads')
            recommended.add('google_ads')
            recommended.add('google_workspace')   // GA4 ecommerce events
            recommended.add('firecrawl')          // catalog crawl
            break
        case 'local':
            mandatory.add('gbp')
            recommended.add('google_workspace')   // GA4
            break
        case 'saas':
            recommended.add('google_ads')
            break
        case 'service':
            // mostly default
            break
        case 'content':
            recommended.add('github')             // for blog publishing
            break
    }

    // Conversion mechanism nuances
    if (conv.includes('רכישה ישירה באתר')) {
        recommended.add('google_workspace')       // GA4 ecommerce
    }

    // If the user picked an explicit goal that maps to a specific platform,
    // promote the platform from recommended → mandatory only when there's
    // NO other connected ad platform available. We'll resolve this at
    // checkConnected time.

    return {
        mandatory: Array.from(mandatory),
        recommended: Array.from(recommended).filter(id => !mandatory.has(id)),
    }
}

// ─────────────────────────────────────────────────────────────────────
// Connection check — uses overlay-aware instance + active agent row
// ─────────────────────────────────────────────────────────────────────
type CheckSource = {
    instance: Pick<InstanceRow, 'aiProviderKey' | 'openaiApiKey' | 'firecrawlKey' | 'dataforseoKey' | 'gscTokens' | 'googleTokens' | 'metaTokens' | 'githubConfig' | 'researchData'>
    agent: MatehAgentRow | null
}

export function checkRequirementStatus(
    id: IntegrationId,
    src: CheckSource,
): 'connected' | 'missing' {
    // Active-agent fields take precedence over instance row (Phase 2.3.E)
    const agent = src.agent
    const inst = src.instance
    const get = <K extends keyof MatehAgentRow & keyof CheckSource['instance']>(k: K): unknown => {
        return (agent && agent[k] != null && agent[k] !== '') ? agent[k] : (inst as Record<string, unknown>)[k as string]
    }

    switch (id) {
        case 'ai_key': {
            const anthropic = get('aiProviderKey') as string | null
            const openai = get('openaiApiKey') as string | null
            return (anthropic || openai) ? 'connected' : 'missing'
        }
        case 'website_url': {
            const rd = (agent?.researchData ?? inst.researchData) as { answers?: { websiteUrl?: string } } | null
            const url = (rd?.answers?.websiteUrl || '').trim()
            return url ? 'connected' : 'missing'
        }
        case 'business_profile': {
            const rd = (agent?.researchData ?? inst.researchData) as { answers?: { businessName?: string; businessDescription?: string } } | null
            const ans = rd?.answers
            const ok = !!ans?.businessName && (ans?.businessDescription || '').length >= 30
            return ok ? 'connected' : 'missing'
        }
        case 'gsc': {
            const tokens = get('gscTokens') as { refreshToken?: string; accessToken?: string; siteUrl?: string } | null
            return (tokens?.refreshToken || tokens?.accessToken) ? 'connected' : 'missing'
        }
        case 'dataforseo':
            return (get('dataforseoKey') as string | null) ? 'connected' : 'missing'
        case 'firecrawl':
            return (get('firecrawlKey') as string | null) ? 'connected' : 'missing'
        case 'google_workspace': {
            const tokens = get('googleTokens') as { accessToken?: string; refreshToken?: string } | null
            return (tokens?.accessToken || tokens?.refreshToken) ? 'connected' : 'missing'
        }
        case 'google_ads': {
            const tokens = get('googleTokens') as { scopes?: string[] | string; scope?: string } | null
            if (!tokens) return 'missing'
            const scopes = (tokens.scopes || tokens.scope || '').toString().toLowerCase()
            return (scopes.includes('adwords') || scopes.split(/[\s,]+/).includes('ads')) ? 'connected' : 'missing'
        }
        case 'meta_ads': {
            const tokens = get('metaTokens') as { adAccountId?: string; adAccounts?: unknown[]; userAccessToken?: string; status?: string } | null
            if (!tokens) return 'missing'
            const hasAdAccount = !!(tokens.adAccountId || (tokens.adAccounts && tokens.adAccounts.length))
            const isConnected = tokens.status === 'connected' && !!tokens.userAccessToken
            return (hasAdAccount && isConnected) ? 'connected' : 'missing'
        }
        case 'github': {
            const cfg = get('githubConfig') as { token?: string; repo?: string } | null
            return (cfg?.token && cfg?.repo) ? 'connected' : 'missing'
        }
        case 'gbp':
            // GBP integration not yet wired into mateh_agents; defer to instance
            // row read via gbpConfig table (handled by separate query if needed).
            // For now, treat as 'missing' to surface in checklist.
            return 'missing'
    }
}

// ─────────────────────────────────────────────────────────────────────
// Public entry points
// ─────────────────────────────────────────────────────────────────────

/**
 * Get full integration requirements + status for an instance/agent.
 * If `stage` is given, returns the per-stage subset; otherwise returns
 * the union of profile-derived requirements (everything the user should
 * connect for their full pipeline to work end-to-end).
 */
export function buildPreflight(
    src: CheckSource,
    answers: Answers,
    stage?: StageId,
): {
    canProceed: boolean
    requirements: RequirementWithStatus[]
    missingMandatory: RequirementWithStatus[]
    missingRecommended: RequirementWithStatus[]
} {
    const profileReqs = deriveProfileRequirements(answers)
    const stageReqs = stage ? STAGE_REQUIREMENTS[stage] : undefined

    // Build the merged requirements map
    const merged = new Map<IntegrationId, 'mandatory' | 'recommended'>()
    const addReqs = (mandatory: IntegrationId[], recommended: IntegrationId[]) => {
        for (const id of mandatory) merged.set(id, 'mandatory')
        for (const id of recommended) {
            // Don't downgrade mandatory → recommended
            if (!merged.has(id)) merged.set(id, 'recommended')
        }
    }
    addReqs(profileReqs.mandatory, profileReqs.recommended)
    if (stageReqs) {
        addReqs(stageReqs.mandatory, stageReqs.recommended)
    }

    const requirements: RequirementWithStatus[] = []
    for (const [id, severity] of merged.entries()) {
        const base = REGISTRY[id]
        if (!base) continue
        const status = checkRequirementStatus(id, src)
        requirements.push({ ...base, severity, status })
    }

    const missingMandatory = requirements.filter(r => r.severity === 'mandatory' && r.status === 'missing')
    const missingRecommended = requirements.filter(r => r.severity === 'recommended' && r.status === 'missing')

    return {
        canProceed: missingMandatory.length === 0,
        requirements,
        missingMandatory,
        missingRecommended,
    }
}