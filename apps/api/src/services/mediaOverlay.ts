/**
 * Hebrew typography overlay (Phase M.1.5).
 *
 * fal.ai image models render Hebrew as garbage ("וירС 2 2"). Instead of
 * fighting that, we generate clean images with explicit NEGATIVE SPACE in
 * one third, then composite a Hebrew headline on top using sharp + SVG
 * with proper RTL text direction.
 *
 * SVG `<text direction="rtl">` handles bidi correctly. The actual glyph
 * rendering happens inside sharp's librsvg backend — it uses system fonts
 * (so the mgmt VPS must have Hebrew-capable fonts installed; we provision
 * fonts-noto-core + fonts-liberation via apt).
 *
 * Called by mediaOrchestrator after fal.ai returns bytes, BEFORE SFTP
 * upload, so the version that lives on the client's VPS is the final one.
 */
import sharp from 'sharp'

export type OverlayPosition = 'top' | 'bottom' | 'left' | 'right' | 'none'

export interface OverlayOpts {
    text: string
    position: OverlayPosition
    textColor?: string       // hex — default white
    backgroundColor?: string // rgba() — default translucent black gradient
    fontSize?: number        // px — auto-calc if unset
}

function escapeSvgText(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
}

function buildOverlaySvg(imgW: number, imgH: number, opts: OverlayOpts): string {
    const {
        text,
        position,
        textColor = '#FFFFFF',
        backgroundColor = 'rgba(0,0,0,1)',
    } = opts

    // Auto font-size: ~4.5% of short edge, but never shorter than what's
    // needed to fit the text in the chosen third at 1.6× char width.
    const baseDim = Math.min(imgW, imgH)
    const charBudget = Math.max(text.length, 8)
    const autoFs = Math.max(
        Math.round(baseDim * 0.045),
        Math.round((imgW * 0.8) / charBudget * 1.6),
    )
    const fontSize = opts.fontSize || Math.min(autoFs, Math.round(baseDim * 0.11))
    const safeText = escapeSvgText(text)

    // Geometry per position
    let rectX = 0, rectY = 0, rectW = imgW, rectH = Math.round(imgH * 0.32)
    let textX = imgW / 2, textY = 0
    let gradientDir = 'x1="0" y1="0" x2="0" y2="1"'
    let stops = `<stop offset="0%" stop-color="${backgroundColor}" stop-opacity="0.88"/>
                 <stop offset="100%" stop-color="${backgroundColor}" stop-opacity="0"/>`

    if (position === 'top') {
        rectY = 0
        textY = rectH / 2 + fontSize / 3
    } else if (position === 'bottom') {
        rectY = imgH - rectH
        textY = rectY + rectH / 2 + fontSize / 3
        stops = `<stop offset="0%" stop-color="${backgroundColor}" stop-opacity="0"/>
                 <stop offset="100%" stop-color="${backgroundColor}" stop-opacity="0.88"/>`
    } else if (position === 'left') {
        rectX = 0; rectW = Math.round(imgW * 0.42); rectH = imgH
        textX = rectW / 2; textY = imgH / 2 + fontSize / 3
        gradientDir = 'x1="0" y1="0" x2="1" y2="0"'
    } else if (position === 'right') {
        rectX = imgW - Math.round(imgW * 0.42); rectW = Math.round(imgW * 0.42); rectH = imgH
        textX = rectX + rectW / 2; textY = imgH / 2 + fontSize / 3
        gradientDir = 'x1="1" y1="0" x2="0" y2="0"'
    } else {
        return `<svg xmlns="http://www.w3.org/2000/svg" width="${imgW}" height="${imgH}"></svg>`
    }

    const strokeW = Math.max(1, Math.round(fontSize * 0.04))

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${imgW}" height="${imgH}">
  <defs>
    <linearGradient id="g" ${gradientDir}>${stops}</linearGradient>
  </defs>
  <rect x="${rectX}" y="${rectY}" width="${rectW}" height="${rectH}" fill="url(#g)"/>
  <text
    x="${textX}" y="${textY}"
    font-family="'Noto Sans Hebrew', 'Arial Hebrew', 'Liberation Sans', Arial, sans-serif"
    font-size="${fontSize}"
    font-weight="700"
    fill="${textColor}"
    text-anchor="middle"
    direction="rtl"
    style="paint-order:stroke;stroke:rgba(0,0,0,0.4);stroke-width:${strokeW}px">${safeText}</text>
</svg>`
}

/**
 * Composite a Hebrew headline onto an image. Returns a new image buffer.
 * If overlay params are invalid (no text or position='none') returns the
 * input buffer unchanged. Never throws — falls back to the original bytes.
 */
export async function compositeHebrewOverlay(
    imageBytes: Buffer,
    opts: OverlayOpts,
): Promise<Buffer> {
    if (!opts.text.trim() || opts.position === 'none') return imageBytes
    try {
        const meta = await sharp(imageBytes).metadata()
        const w = meta.width || 1200
        const h = meta.height || 1200
        const svg = buildOverlaySvg(w, h, opts)
        return await sharp(imageBytes)
            .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
            .jpeg({ quality: 92 })
            .toBuffer()
    } catch (err) {
        console.warn('[mediaOverlay] composite failed — returning base image:', (err as Error).message)
        return imageBytes
    }
}