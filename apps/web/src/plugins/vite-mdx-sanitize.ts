import type { Plugin } from 'vite'

const sanitizeFrontmatter = (raw: string): string => {
    let fm = raw

    fm = fm.replace(/\u2014/g, '-')
    fm = fm.replace(/[\u201C\u201D]/g, '"')
    fm = fm.replace(/[\u2018\u2019]/g, "'")

    // eslint-disable-next-line no-control-regex
    fm = fm.replace(/[^\x00-\x7F\n\r\t ]/g, '')

    fm = fm
        .split('\n')
        .map((line: string) => {
            if (line.match(/^\s*-\s+['"`]/)) {
                const match = line.match(/^(\s*-\s+)['"`]\s*(.+?)\s*['"`]/)
                if (match) return `${match[1]}${match[2]}`
            }

            if (/^\s*\d+\s*:/.test(line)) {
                return '# ' + line
            }

            return line
        })
        .join('\n')

    return fm
}

const escapeProseLine = (line: string): string => {
    const segments: string[] = []
    let remaining = line
    const inlineCodePattern = /`[^`]*`/

    while (remaining.length > 0) {
        const match = remaining.match(inlineCodePattern)
        if (!match || match.index === undefined) {
            segments.push(escapeSegment(remaining))
            break
        }

        if (match.index > 0) {
            segments.push(escapeSegment(remaining.slice(0, match.index)))
        }
        segments.push(match[0])
        remaining = remaining.slice(match.index + match[0].length)
    }

    return segments.join('')
}

const escapeSegment = (text: string): string => {
    return text
        .replace(/<(?![a-zA-Z/!])/g, '&lt;')
        .replace(/\{/g, '&#123;')
        .replace(/\}/g, '&#125;')
}

const sanitizeMdx = (content: string): string => {
    const frontmatterMatch = content.match(
        /^(---\n)([\s\S]*?)(\n---)([\s\S]*)$/
    )

    let body: string
    let header: string

    if (frontmatterMatch) {
        const sanitizedFm = sanitizeFrontmatter(frontmatterMatch[2])
        header = `${frontmatterMatch[1]}${sanitizedFm}${frontmatterMatch[3]}`
        body = frontmatterMatch[4]
    } else {
        header = ''
        body = content
    }

    const lines = body.split('\n')
    let inCodeBlock = false
    const result: string[] = []

    for (const line of lines) {
        if (line.trim().startsWith('```')) {
            inCodeBlock = !inCodeBlock
            result.push(line)
            continue
        }

        if (inCodeBlock) {
            result.push(line)
            continue
        }

        result.push(escapeProseLine(line))
    }

    return header + result.join('\n')
}

const viteMdxSanitize = (): Plugin => {
    return {
        name: 'vite-mdx-sanitize',
        enforce: 'pre',

        transform(code: string, id: string) {
            if (!id.split('?')[0].endsWith('.mdx')) {
                return null
            }

            return {
                code: sanitizeMdx(code),
                map: null
            }
        }
    }
}

export default viteMdxSanitize