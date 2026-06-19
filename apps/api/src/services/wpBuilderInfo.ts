/**
 * Shared WordPress page-builder probe — asks the Flowmatic companion plugin
 * (v1.15.0+) how a post/page is built and returns its RENDERED content + word
 * count. Page-builder pages (Elementor/Divi/etc.) keep their real content in
 * widgets, not post_content, so the only reliable way to read/judge their
 * content is the rendered output. Used by:
 *   - seoPageRefresh  (routing + thinness on rendered content)
 *   - seoSchemaBatch  (generate schema from real content on Elementor pages)
 *   - seoMetaBatch    (generate meta description from real content)
 *
 * Returns null when the companion isn't installed / endpoint absent (older
 * plugin) so callers fall back to their classic content path.
 */
interface WpAuth { url: string; user: string; appPassword: string }

export interface BuilderInfo {
    ok: boolean
    builder: string                 // 'classic'|'gutenberg'|'elementor'|'divi'|'wpbakery'|'beaver'
    isBuilder: boolean
    isFrontPage: boolean
    renderedWords: number
    renderedExcerpt: string
    canAppend: boolean              // native Elementor append supported
}

const norm = (u: string) => u.replace(/\/+$/, '')
const authHeader = (c: WpAuth) => 'Basic ' + Buffer.from(`${c.user}:${c.appPassword}`).toString('base64')

export async function getBuilderInfo(cfg: WpAuth, postId: number): Promise<BuilderInfo | null> {
    try {
        const res = await fetch(`${norm(cfg.url)}/wp-json/clawflow/v1/builder-info?post_id=${postId}`, {
            headers: { Authorization: authHeader(cfg) }, signal: AbortSignal.timeout(25000),
        })
        if (!res.ok) return null   // 404 = companion absent / too old
        const j = await res.json().catch(() => null) as Record<string, unknown> | null
        if (!j || !j.ok) return null
        return {
            ok: true,
            builder: String(j.builder || 'classic'),
            isBuilder: !!j.is_builder,
            isFrontPage: !!j.is_front_page,
            renderedWords: Number(j.rendered_words || 0),
            renderedExcerpt: String(j.rendered_excerpt || ''),
            canAppend: !!j.can_append,
        }
    } catch { return null }
}

/** Native Elementor content append via the companion Document API. */
export async function elementorAppendContent(cfg: WpAuth, postId: number, html: string): Promise<{ ok: boolean; newWords?: number; error?: string }> {
    try {
        const res = await fetch(`${norm(cfg.url)}/wp-json/clawflow/v1/elementor-append`, {
            method: 'POST',
            headers: { Authorization: authHeader(cfg), 'Content-Type': 'application/json' },
            body: JSON.stringify({ post_id: postId, html }),
            signal: AbortSignal.timeout(45000),
        })
        if (!res.ok) return { ok: false, error: `${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}` }
        const j = await res.json().catch(() => ({})) as Record<string, unknown>
        return { ok: !!j.ok, newWords: Number(j.new_rendered_words || 0) }
    } catch (err) { return { ok: false, error: (err as Error).message } }
}