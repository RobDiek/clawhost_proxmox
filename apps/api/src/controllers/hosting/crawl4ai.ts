/**
 * Crawl4AI Controller — Deep-crawl competitor websites for MATEH research enrichment.
 *
 * Called after runResearch() completes. Takes competitor URLs from research data,
 * crawls each one with Crawl4AI, and stores structured markdown in researchData.
 */

import type { Context } from 'hono'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { instances } from '@/db/schema'
import { ok, fail } from '@/lib/response'
import { resolveUserId, getOwnedInstance } from './authHelper'
import { crawlMultiple } from '@/services/crawl4ai'

// POST /hosting/instances/:id/research/deep-crawl
// Body: { urls?: string[] } — optional override; defaults to extracting from research report
export const deepCrawlCompetitors = async (c: Context) => {
    try {
        const userId = resolveUserId(c)
        if (!userId) return fail(c, 'Unauthorized', 401)

        const instanceId = c.req.param('id')
        const instance = await getOwnedInstance(instanceId, userId)
        if (!instance) return fail(c, 'Instance not found', 404)
        if (!instance.ip) return fail(c, 'Instance not ready', 400)

        const body = await c.req.json().catch(() => ({}))
        let urls: string[] = body.urls || []

        // SSRF protection: block internal IPs in user-supplied URLs
        const ssrfBlocked = /^https?:\/\/(localhost|127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.|0\.0\.0\.0|\[::1\])/i
        urls = urls.filter(u => /^https?:\/\//i.test(u) && !ssrfBlocked.test(u))

        // If no URLs provided, extract from research report
        if (urls.length === 0) {
            const researchData = instance.researchData as any
            const report = researchData?.report || ''

            // Extract URLs from markdown — look for http(s):// patterns
            const urlRegex = /https?:\/\/[^\s\)>"',]+/gi
            const found: string[] = report.match(urlRegex) || []

            // Filter: only competitor/business sites, not social media or search engines
            const excludePatterns = [
                'google.com', 'facebook.com', 'instagram.com', 'twitter.com',
                'linkedin.com', 'youtube.com', 'tiktok.com', 'wikipedia.org',
                'waze.com', 'maps.google', 'wa.me', 't.me'
            ]

            const unique = Array.from(new Set(found))
            urls = unique
                .filter(u => !excludePatterns.some(p => u.includes(p)))
                .slice(0, 8) // Max 8 competitor sites
        }

        if (urls.length === 0) {
            return ok(c, { crawled: 0, results: [] }, 'No competitor URLs found to crawl')
        }

        console.log(`Deep crawling ${urls.length} competitor sites for instance ${instanceId}`)

        const results = await crawlMultiple(
            instance.ip,
            urls,
            instance.rootPassword || undefined,
            2 // max 2 concurrent to avoid overloading VPS
        )

        // Store crawled data in researchData
        const existingData = (instance.researchData as any) || {}
        await db.update(instances).set({
            researchData: {
                ...existingData,
                competitorCrawls: results.map(r => ({
                    url: r.url,
                    title: r.title,
                    contentPreview: r.markdown.slice(0, 3000), // First 3000 chars
                    linksCount: r.links.length,
                    crawledAt: new Date().toISOString(),
                })),
                deepCrawlAt: new Date().toISOString(),
            } as any,
        }).where(eq(instances.id, instanceId))

        // Also save full crawl data on VPS for strategy agent
        const crawlSummary = results.map(r =>
            `## ${r.title || r.url}\nURL: ${r.url}\n\n${r.markdown.slice(0, 5000)}\n\n---\n`
        ).join('\n')

        const b64 = Buffer.from(crawlSummary).toString('base64')

        // Use the same SSH helper pattern as the rest of the codebase
        const { Client } = await import('ssh2')
        const { readFileSync } = await import('fs')

        const sshExec = (cmd: string): Promise<string> => new Promise((resolve, reject) => {
            const conn = new Client()
            let out = ''
            const timer = setTimeout(() => { conn.end(); reject(new Error('timeout')) }, 30_000)
            conn.on('ready', () => {
                conn.exec(cmd, (err, stream) => {
                    if (err) { conn.end(); clearTimeout(timer); return reject(err) }
                    stream.on('data', (d: Buffer) => { out += d.toString() })
                    stream.on('close', () => { conn.end(); clearTimeout(timer); resolve(out.trim()) })
                })
            }).on('error', (err) => { clearTimeout(timer); reject(err) })
            const opts: Record<string, unknown> = { host: instance.ip!, port: 22, username: 'root' }
            if (instance.rootPassword) opts.password = instance.rootPassword
            try { opts.privateKey = readFileSync(process.env.MASTER_SSH_KEY_PATH || '/root/.ssh/openclaw_master') } catch {}
            conn.connect(opts)
        })

        await sshExec(
            `echo '${b64}' | base64 -d > /home/openclaw/.openclaw/workspace/COMPETITOR_ANALYSIS.md && chown openclaw:openclaw /home/openclaw/.openclaw/workspace/COMPETITOR_ANALYSIS.md`
        )

        console.log(`Deep crawl complete: ${results.length}/${urls.length} sites crawled for ${instanceId}`)

        return ok(c, {
            crawled: results.length,
            total: urls.length,
            sites: results.map(r => ({ url: r.url, title: r.title, contentLength: r.markdown.length }))
        }, `Crawled ${results.length} competitor websites`)
    } catch (err) {
        console.error('deepCrawlCompetitors error:', err)
        return fail(c, 'Deep crawl failed', 500)
    }
}

// GET /hosting/instances/:id/research/crawl-status
export const getCrawlStatus = async (c: Context) => {
    try {
        const userId = resolveUserId(c)
        if (!userId) return fail(c, 'Unauthorized', 401)

        const instanceId = c.req.param('id')
        const instance = await getOwnedInstance(instanceId, userId)
        if (!instance) return fail(c, 'Instance not found', 404)

        const researchData = instance.researchData as any
        const crawls = researchData?.competitorCrawls || []

        return ok(c, {
            hasCrawlData: crawls.length > 0,
            crawledSites: crawls.length,
            crawledAt: researchData?.deepCrawlAt || null,
            sites: crawls.map((cr: any) => ({
                url: cr.url,
                title: cr.title,
                contentLength: cr.contentPreview?.length || 0,
            })),
        }, 'Crawl status retrieved')
    } catch (err) {
        console.error('getCrawlStatus error:', err)
        return fail(c, 'Failed to get crawl status', 500)
    }
}
