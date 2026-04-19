/**
 * Crawl4AI Service — Execute web crawling on client VPS via SSH.
 *
 * Crawl4AI converts web pages to clean LLM-ready Markdown.
 * Used by the MATEH research engine to analyze competitor websites.
 */

import { Client } from 'ssh2'
import { readFileSync } from 'fs'

const SSH_KEY_PATH = process.env.MASTER_SSH_KEY_PATH || '/root/.ssh/openclaw_master'

let sshKeyCache: Buffer | null = null
function getSSHKey(): Buffer {
    if (!sshKeyCache) sshKeyCache = readFileSync(SSH_KEY_PATH)
    return sshKeyCache
}

function sshExec(ip: string, command: string, password?: string, timeoutMs = 120_000): Promise<string> {
    return new Promise((resolve, reject) => {
        const conn = new Client()
        let output = ''
        const timer = setTimeout(() => { conn.end(); reject(new Error('SSH timeout')) }, timeoutMs)

        conn.on('ready', () => {
            conn.exec(command, (err, stream) => {
                if (err) { conn.end(); clearTimeout(timer); return reject(err) }
                stream.on('data', (d: Buffer) => { output += d.toString() })
                stream.stderr.on('data', (d: Buffer) => { output += d.toString() })
                stream.on('close', () => { conn.end(); clearTimeout(timer); resolve(output.trim()) })
            })
        }).on('error', (err) => { clearTimeout(timer); reject(err) })

        const opts: Record<string, unknown> = { host: ip, port: 22, username: 'root' }
        if (password) opts.password = password
        try { opts.privateKey = getSSHKey() } catch { if (!password) return reject(new Error('No SSH credentials')) }
        conn.connect(opts)
    })
}

/**
 * Crawl a URL and return clean Markdown content.
 * Runs Crawl4AI on the client VPS via a Python one-liner.
 */
export async function crawlUrl(
    ip: string,
    url: string,
    password?: string
): Promise<{ markdown: string; title: string; links: string[] } | null> {
    // Sanitize URL — only allow http/https, block internal IPs (SSRF protection)
    if (!/^https?:\/\//i.test(url)) return null
    const ssrfBlocked = /^https?:\/\/(localhost|127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.|0\.0\.0\.0|\[::1\])/i
    if (ssrfBlocked.test(url)) return null

    // Pass URL via base64 environment variable — never interpolate into code
    const b64Url = Buffer.from(url).toString('base64')

    const pythonScript = `
import asyncio, json, sys, os, base64

url = base64.b64decode(os.environ.get("CRAWL_URL", "")).decode("utf-8")
if not url:
    print(json.dumps({"error": "no_url"}))
    sys.exit(1)

async def main():
    from crawl4ai import AsyncWebCrawler, CrawlerRunConfig
    config = CrawlerRunConfig(
        word_count_threshold=50,
        excluded_tags=['nav', 'footer', 'header', 'aside', 'script', 'style'],
        exclude_external_links=False,
    )
    async with AsyncWebCrawler() as crawler:
        result = await crawler.arun(url=url, config=config)
        if result.success:
            links = [l.get('href','') for l in (result.links.get('internal',[]) + result.links.get('external',[]))[:20]]
            print(json.dumps({
                "markdown": result.markdown[:15000],
                "title": (result.metadata or {}).get("title", ""),
                "links": links
            }))
        else:
            print(json.dumps({"error": "crawl_failed"}))

asyncio.run(main())
`

    // Deploy script as file, pass URL via env var
    const b64Script = Buffer.from(pythonScript).toString('base64')

    try {
        const raw = await sshExec(
            ip,
            `echo '${b64Script}' | base64 -d > /tmp/crawl4ai_run.py && CRAWL_URL='${b64Url}' python3 /tmp/crawl4ai_run.py 2>/dev/null`,
            password,
            90_000 // 90s timeout per page
        )

        const parsed = JSON.parse(raw)
        if (parsed.error) return null
        return parsed
    } catch {
        return null
    }
}

/**
 * Crawl multiple URLs (for competitor analysis).
 * Returns array of results, skipping failures.
 */
export async function crawlMultiple(
    ip: string,
    urls: string[],
    password?: string,
    maxConcurrent = 3
): Promise<Array<{ url: string; markdown: string; title: string; links: string[] }>> {
    const results: Array<{ url: string; markdown: string; title: string; links: string[] }> = []

    // Process in batches to avoid overloading VPS
    for (let i = 0; i < urls.length; i += maxConcurrent) {
        const batch = urls.slice(i, i + maxConcurrent)
        const batchResults = await Promise.allSettled(
            batch.map(async (url) => {
                const result = await crawlUrl(ip, url, password)
                return result ? { url, ...result } : null
            })
        )

        for (const r of batchResults) {
            if (r.status === 'fulfilled' && r.value) {
                results.push(r.value)
            }
        }
    }

    return results
}

export default { crawlUrl, crawlMultiple }