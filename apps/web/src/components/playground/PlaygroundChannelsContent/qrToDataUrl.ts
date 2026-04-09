const UPPER_HALF = '\u2580'
const LOWER_HALF = '\u2584'
const FULL_BLOCK = '\u2588'

const qrToDataUrl = (qrText: string): string => {
    const lines = qrText.split('\n').filter((l) => l.length > 0)
    const width = Math.max(...lines.map((l) => [...l].length))
    const height = lines.length * 2
    const canvas = document.createElement('canvas')
    const scale = 4
    canvas.width = width * scale
    canvas.height = height * scale
    const ctx = canvas.getContext('2d')
    if (!ctx) return ''
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    lines.forEach((line, row) => {
        const chars = [...line]
        chars.forEach((ch, col) => {
            const topBlack = ch === FULL_BLOCK || ch === UPPER_HALF
            const bottomBlack = ch === FULL_BLOCK || ch === LOWER_HALF
            if (topBlack) {
                ctx.fillStyle = '#000000'
                ctx.fillRect(col * scale, row * 2 * scale, scale, scale)
            }
            if (bottomBlack) {
                ctx.fillStyle = '#000000'
                ctx.fillRect(col * scale, (row * 2 + 1) * scale, scale, scale)
            }
        })
    })
    return canvas.toDataURL()
}

export default qrToDataUrl