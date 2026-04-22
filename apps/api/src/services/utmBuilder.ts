/**
 * UTM Parameter Builder.
 *
 * Every paid ad destination URL MUST carry UTM tags so GA4 / Mixpanel /
 * Plausible can attribute conversions back to channel / campaign / creative.
 * Without this attribution the Strategy Lab (Phase G) has no performance data
 * to learn from and the whole feedback loop is broken.
 *
 * Standard shape (GA4-friendly):
 *   utm_source   = publishing platform (meta | google | linkedin | organic)
 *   utm_medium   = 'cpc' for paid search, 'paid_social' for meta/li paid,
 *                  'email' for newsletters, 'social' for organic posts,
 *                  'organic' for SEO
 *   utm_campaign = content plan item id (cp_abc123) — unique, reversible
 *   utm_content  = first 30 chars of the hook, slugified (for the media
 *                  buyer's eye when reading reports)
 *   utm_term     = persona name or 'general' (for Google Ads gets auto-
 *                  overridden by {keyword} — we set a safe default)
 *
 * Existing query params on the URL are preserved (never duplicated).
 */

type Medium = 'cpc' | 'paid_social' | 'email' | 'social' | 'organic'

const CHANNEL_TO_SOURCE_MEDIUM: Record<string, { source: string; medium: Medium }> = {
    meta_ads:   { source: 'meta',     medium: 'paid_social' },
    google_ads: { source: 'google',   medium: 'cpc' },
    linkedin:   { source: 'linkedin', medium: 'social' },
    facebook:   { source: 'meta',     medium: 'social' },
    instagram:  { source: 'instagram', medium: 'social' },
    tiktok:     { source: 'tiktok',   medium: 'social' },
    youtube:    { source: 'youtube',  medium: 'social' },
    email:      { source: 'newsletter', medium: 'email' },
    blog:       { source: 'blog',     medium: 'organic' },
    reddit:     { source: 'reddit',   medium: 'social' },
}

export interface UtmContext {
    channel: string
    contentPlanItemId?: string  // cp_abc123
    hook?: string               // for utm_content (slugified)
    persona?: string            // for utm_term
    pillar?: string             // used as utm_term fallback
    paidCampaignName?: string   // when media buyer names the campaign, override utm_campaign
}

export function slugify(s: string, maxLen = 30): string {
    if (!s) return ''
    return s
        .toLowerCase()
        // Keep Hebrew, Latin, numbers, spaces, dashes
        .replace(/[^\u0590-\u05ffa-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .substring(0, maxLen)
}

/**
 * Append UTM tags to a URL. Preserves existing query params (doesn't overwrite
 * if the caller already set their own utm_*).
 */
export function appendUtm(rawUrl: string, ctx: UtmContext): string {
    if (!rawUrl || !/^https?:\/\//i.test(rawUrl)) return rawUrl
    const mapping = CHANNEL_TO_SOURCE_MEDIUM[ctx.channel] || { source: ctx.channel || 'direct', medium: 'organic' as Medium }
    const campaign = ctx.paidCampaignName
        ? slugify(ctx.paidCampaignName, 50)
        : (ctx.contentPlanItemId || 'manual')
    const content = ctx.hook ? slugify(ctx.hook) : (ctx.contentPlanItemId || '')
    const term = ctx.persona
        ? slugify(ctx.persona, 20)
        : ctx.pillar ? slugify(ctx.pillar, 20) : 'general'

    const wanted: Record<string, string> = {
        utm_source: mapping.source,
        utm_medium: mapping.medium,
        utm_campaign: campaign,
    }
    if (content) wanted.utm_content = content
    if (term) wanted.utm_term = term

    try {
        const u = new URL(rawUrl)
        for (const [k, v] of Object.entries(wanted)) {
            if (!u.searchParams.has(k) && v) u.searchParams.set(k, v)
        }
        // Google Ads keyword token — only append if the source is google and
        // we didn't already put a concrete term. Leaves space for the platform
        // to substitute the matched keyword at serve time.
        if (mapping.source === 'google' && u.searchParams.get('utm_term') === term && term === 'general') {
            u.searchParams.set('utm_term', '{keyword}')
        }
        return u.toString()
    } catch {
        return rawUrl
    }
}

/**
 * Helper for code that doesn't have a full UtmContext but still wants UTMs —
 * e.g. organic share of a blog post.
 */
export function appendUtmSimple(rawUrl: string, channel: string, campaign: string): string {
    return appendUtm(rawUrl, { channel, contentPlanItemId: campaign })
}