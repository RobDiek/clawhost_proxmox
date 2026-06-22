/**
 * Live-verify DFS "lost backlink" classifications before they drive costly
 * recovery outreach.
 *
 * Why: DataForSEO's lost-backlink signal LAGS and false-positives — especially
 * on JS-rendered IL editorial "recommended" widgets (israelhayom / maariv
 * מומלצים, Taboola-style boxes) whose links DFS's crawler can't render. A link
 * that's plainly live in the browser shows up in DFS as "lost" with a lost_date.
 * Treating that as a real loss produces a senior-grade-looking but WRONG task:
 * "pay ₪3,000 + 4h outreach to recover the israelhayom link" — for a link that
 * never went anywhere.
 *
 * Fix: fetch the actual source page (url_from) — rendered via Firecrawl when a
 * key is available (to catch JS widgets), else a plain GET — and check whether
 * it STILL references our domain. Only links we can confirm are gone should
 * drive a paid recovery; ones still live are dropped; ones we couldn't fetch
 * are flagged 'unverified' so downstream treats them cautiously.
 */

const FIRECRAWL_API = 'https://api.firecrawl.dev/v1/scrape'

export type LostVerification = 'still_live' | 'confirmed_lost' | 'unverified'

export function normalizeDomain(d?: string | null): string {
    return String(d || '').trim().toLowerCase()
        .replace(/^https?:\/\//, '')
        .replace(/^www\./, '')
        .replace(/[/:?#].*$/, '')
        .trim()
}

async function fetchPlain(url: string, timeoutMs = 12000): Promise<string | null> {
    try {
        const res = await fetch(url, {
            redirect: 'follow',
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FlowmaticLinkAudit/1.0; +https://flowmatic.co.il)' },
            signal: AbortSignal.timeout(timeoutMs),
        })
        if (!res.ok) return null
        return await res.text()
    } catch {
        return null
    }
}

async function fetchRendered(url: string, firecrawlKey: string, timeoutMs = 25000): Promise<string | null> {
    try {
        const res = await fetch(FIRECRAWL_API, {
            method: 'POST',
            headers: { Authorization: `Bearer ${firecrawlKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ url, formats: ['html', 'links'], onlyMainContent: false, waitFor: 2500, timeout: timeoutMs }),
            signal: AbortSignal.timeout(timeoutMs + 6000),
        })
        if (!res.ok) return null
        const j = await res.json() as { data?: { html?: string; rawHtml?: string; links?: string[] } }
        const d = j?.data
        if (!d) return null
        return [d.html || '', d.rawHtml || '', ...(Array.isArray(d.links) ? d.links : [])].join('\n')
    } catch {
        return null
    }
}

/** Does the source page content still reference our domain (link or mention)?
 * Conservative on purpose: if our domain appears at all, treat the backlink as
 * still live → skip recovery. We'd rather skip a recovery than recommend a
 * false (paid) one. */
function pageReferencesUs(content: string, ourDomain: string): boolean {
    if (!content) return false
    return content.toLowerCase().includes(ourDomain.toLowerCase())
}

/**
 * Find outreach contact details for a prospect domain — so a link-gap task is
 * actionable ("here's who to email"), not an abstract "do outreach". Fetches
 * the homepage, follows a contact-page link if present, and extracts the best
 * email / IL phone / WhatsApp. Best-effort; blanks when nothing is found.
 */
export async function findContact(domain: string, _firecrawlKey?: string | null): Promise<{ email: string; phone: string; page: string }> {
    const base = 'https://' + normalizeDomain(domain)
    let html = await fetchPlain(base, 9000)
    let page = base
    if (html) {
        const m = html.match(/href=["']([^"']*(?:contact|%D7%A6%D7%95%D7%A8|kesher|about)[^"']*)["']/i)
        if (m) {
            let u = m[1].replace(/&amp;/g, '&')
            if (u.startsWith('//')) u = 'https:' + u
            else if (u.startsWith('/')) u = base + u
            else if (!/^https?:/i.test(u)) u = base + '/' + u
            const ch = await fetchPlain(u, 8000)
            if (ch) { html = ch; page = u }
        }
    }
    if (!html) return { email: '', phone: '', page: '' }
    const emails = [...new Set((html.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) || [])
        .map(e => e.toLowerCase())
        .filter(e => !/\.(png|jpe?g|gif|svg|webp|css|js)$/i.test(e) && !/sentry|example|wixpress|godaddy|@2x|yourdomain|domain\.com/i.test(e)))]
    const wa = (html.match(/(?:wa\.me\/|api\.whatsapp\.com\/send\?phone=)(\d{7,15})/i) || [])[1] || ''
    const ilph = (html.match(/(0[2-9][\d]{1,2}[-\s]?\d{3}[-\s]?\d{3,4})/) || [])[0] || ''
    const phone = (ilph || (wa ? '+' + wa : '')).trim()
    return { email: emails[0] || '', phone, page: (emails.length || phone) ? page : '' }
}

/**
 * Verify per referring-domain whether its DFS-"lost" backlink is actually gone.
 * @param lostByDomain  referring domain → its lost source page URLs (url_from)
 */
export async function verifyLostBacklinks(opts: {
    ourDomain: string
    lostByDomain: Map<string, string[]>
    firecrawlKey?: string | null
    maxDomains?: number
    maxUrlsPerDomain?: number
}): Promise<Map<string, { verdict: LostVerification; checkedUrls: string[] }>> {
    const ourDomain = normalizeDomain(opts.ourDomain)
    const maxDomains = opts.maxDomains ?? 15
    const maxUrlsPerDomain = opts.maxUrlsPerDomain ?? 2
    const out = new Map<string, { verdict: LostVerification; checkedUrls: string[] }>()

    const domains = [...opts.lostByDomain.keys()].slice(0, maxDomains)
    for (const domain of domains) {
        const urls = (opts.lostByDomain.get(domain) || []).filter(Boolean).slice(0, maxUrlsPerDomain)
        if (urls.length === 0) {
            out.set(domain, { verdict: 'unverified', checkedUrls: [] })
            continue
        }
        let verdict: LostVerification = 'unverified'
        const checked: string[] = []
        for (const url of urls) {
            checked.push(url)
            let content = await fetchPlain(url)
            let live = content ? pageReferencesUs(content, ourDomain) : false
            if (!live && opts.firecrawlKey) {
                const rendered = await fetchRendered(url, opts.firecrawlKey)
                if (rendered) { content = rendered; live = pageReferencesUs(rendered, ourDomain) }
            }
            if (live) { verdict = 'still_live'; break }      // any live source → not lost
            if (content !== null) verdict = 'confirmed_lost'  // fetched, no reference → gone
            // else: couldn't fetch this url → leave 'unverified' unless a later url resolves it
        }
        out.set(domain, { verdict, checkedUrls: checked })
    }
    return out
}