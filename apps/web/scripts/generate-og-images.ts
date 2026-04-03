import type { BlogPostFrontmatter } from '@/ts/Interfaces'

import fs from 'fs'
import path from 'path'
import matter from 'gray-matter'
import satori from 'satori'
import { Resvg } from '@resvg/resvg-js'
import { decompress } from 'wawoff2'

const CONTENT = path.resolve(import.meta.dirname, '../content/posts')
const OUTPUT = path.resolve(import.meta.dirname, '../public/og')
const FONTS_DIR = path.resolve(import.meta.dirname, '../public/fonts')
const LOGO_PATH = path.resolve(import.meta.dirname, '../public/clawhost-logo-og.png')

const WIDTH = 1200
const HEIGHT = 630
const ACCENT = '#ef5350'

const hashString = (str: string): number => {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i)
        hash = ((hash << 5) - hash) + char
        hash |= 0
    }
    return Math.abs(hash)
}

const createOgImage = (title: string, slug: string, logoDataUri: string): {
    type: string
    props: Record<string, unknown>
} => {
    const hash = hashString(slug)
    const glowX = 30 + (hash % 40)
    const glowY = 20 + (hash % 30)
    const angle = (hash % 30) + 15

    return {
        type: 'div',
        props: {
            style: {
                width: WIDTH,
                height: HEIGHT,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'flex-end',
                padding: '60px',
                backgroundColor: '#0a0a0f',
                position: 'relative',
                overflow: 'hidden'
            },
            children: [
                {
                    type: 'div',
                    props: {
                        style: {
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            background: `radial-gradient(ellipse 80% 60% at ${glowX}% ${glowY}%, ${ACCENT}22 0%, transparent 70%)`
                        }
                    }
                },
                {
                    type: 'div',
                    props: {
                        style: {
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            backgroundImage: `linear-gradient(${ACCENT}10 1px, transparent 1px), linear-gradient(90deg, ${ACCENT}10 1px, transparent 1px)`,
                            backgroundSize: '48px 48px',
                            transform: `rotate(${angle}deg) scale(1.5)`,
                            transformOrigin: 'center center'
                        }
                    }
                },
                {
                    type: 'div',
                    props: {
                        style: {
                            position: 'absolute',
                            bottom: 0,
                            left: 0,
                            right: 0,
                            height: '50%',
                            background: 'linear-gradient(to top, #0a0a0f, transparent)'
                        }
                    }
                },
                {
                    type: 'img',
                    props: {
                        src: logoDataUri,
                        width: 203,
                        height: 48,
                        style: {
                            position: 'absolute',
                            top: '44px',
                            left: '60px'
                        }
                    }
                },
                {
                    type: 'div',
                    props: {
                        style: {
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '16px',
                            position: 'relative'
                        },
                        children: [
                            {
                                type: 'div',
                                props: {
                                    style: {
                                        width: '48px',
                                        height: '4px',
                                        backgroundColor: ACCENT,
                                        borderRadius: '2px',
                                        marginBottom: '8px'
                                    }
                                }
                            },
                            {
                                type: 'div',
                                props: {
                                    style: {
                                        fontSize: title.length > 60 ? '40px' : '48px',
                                        fontFamily: 'Clash Display',
                                        fontWeight: 700,
                                        color: '#ffffff',
                                        lineHeight: 1.15,
                                        letterSpacing: '-0.02em',
                                        maxWidth: '900px'
                                    },
                                    children: title
                                }
                            }
                        ]
                    }
                }
            ]
        }
    }
}

const generateOgImages = async (): Promise<void> => {
    if (!fs.existsSync(OUTPUT)) {
        fs.mkdirSync(OUTPUT, { recursive: true })
    }

    const loadFont = async (filename: string): Promise<Buffer> => {
        const woff2 = fs.readFileSync(path.join(FONTS_DIR, filename))
        const ttf = await decompress(woff2)
        return Buffer.from(ttf)
    }

    const clashBold = await loadFont('clash-display-700.woff2')
    const clashSemibold = await loadFont('clash-display-600.woff2')

    const logoData = fs.readFileSync(LOGO_PATH)
    const logoDataUri = `data:image/png;base64,${logoData.toString('base64')}`

    const files = fs.readdirSync(CONTENT).filter((f) => f.endsWith('.mdx'))

    let generated = 0
    let skipped = 0

    for (const file of files) {
        const raw = fs.readFileSync(path.join(CONTENT, file), 'utf-8')
        const { data } = matter(raw) as unknown as { data: BlogPostFrontmatter }
        const outputPath = path.join(OUTPUT, `${data.slug}.png`)

        if (fs.existsSync(outputPath)) {
            skipped++
            continue
        }

        const element = createOgImage(data.title, data.slug, logoDataUri)

        // @ts-ignore satori accepts plain objects as virtual DOM elements
        const svg = await satori(element, {
            width: WIDTH,
            height: HEIGHT,
            fonts: [
                {
                    name: 'Clash Display',
                    data: clashBold,
                    weight: 700,
                    style: 'normal'
                },
                {
                    name: 'Clash Display',
                    data: clashSemibold,
                    weight: 600,
                    style: 'normal'
                }
            ]
        })

        const resvg = new Resvg(svg, {
            fitTo: { mode: 'width', value: WIDTH }
        })
        const png = resvg.render().asPng()

        fs.writeFileSync(outputPath, png)
        generated++
    }

    console.log(`OG images: ${generated} generated, ${skipped} skipped (already exist)`)
}

generateOgImages()