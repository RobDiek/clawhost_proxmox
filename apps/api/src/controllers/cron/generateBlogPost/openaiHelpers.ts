import type { BlogTopicDiscovery } from '@/ts/Interfaces'

import OpenAI from 'openai'

const MODEL = 'gpt-4o-mini'

const getOpenAI = () => new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const openaiHelpers = {
    createClient: getOpenAI,

    async discoverTrendingTopic(
        openai: OpenAI,
        existingSlugs: string[]
    ): Promise<BlogTopicDiscovery> {
        const slugList = existingSlugs.slice(0, 50).join('\n')

        const res = await openai.responses.create({
            model: MODEL,
            tools: [{ type: 'web_search_preview' }],
            instructions: `You are a blog editor for ClawHost, the managed hosting platform for OpenClaw (an open-source AI agent framework). Your job is to find a trending topic in AI, tech, or open-source that can be written about from the perspective of OpenClaw and AI agents.

Search the web for what is currently trending in AI news, AI agents, open-source AI, automation, or related technology topics.

Then propose ONE blog post idea that:
1. Connects a current trending topic to OpenClaw or AI agents in general
2. Is NOT already covered by the existing blog posts listed below
3. Would be interesting and timely for developers and tech enthusiasts
4. Has a clear, specific angle (not generic)

EXISTING BLOG SLUGS (do not repeat these topics):
${slugList}

Respond in EXACTLY this JSON format, nothing else:
{"title": "The Blog Post Title Here", "angle": "A 2-3 sentence description of the specific angle and what the post should cover"}`,
            input: 'Find trending AI and technology topics from the past week and propose a blog post idea.'
        })

        const text = res.output_text

        try {
            const cleaned = text
                .replace(/```json\n?/g, '')
                .replace(/```\n?/g, '')
                .trim()
            return JSON.parse(cleaned)
        } catch {
            return {
                title: 'What Developers Should Know About AI Agents Today',
                angle: 'A roundup of the latest developments in AI agents and how OpenClaw fits into the evolving landscape.'
            }
        }
    },

    async generateBlogContent(
        openai: OpenAI,
        title: string,
        angle: string
    ): Promise<string> {
        const res = await openai.responses.create({
            model: MODEL,
            tools: [{ type: 'web_search_preview' }],
            instructions: `You are a senior technical writer for ClawHost, the managed hosting platform for OpenClaw.

OpenClaw is an open-source AI agent framework with:
- Browser automation
- Runs on VPS or via ClawHost managed hosting
- Uses AI models (Claude, GPT-4, local models via Ollama)
- MIT licensed, ~140k GitHub stars
- Created by Peter Steinberger

WRITING RULES:
- Write 200-300 lines of markdown content
- Use ## and ### headers for sections (at least 6 sections)
- Be factually accurate — do not fabricate statistics or studies
- Do not make up quotes from real people
- Write in an engaging, informative style — not marketing fluff
- Always connect back to OpenClaw and AI agents where relevant
- Include practical takeaways for readers
- Do NOT include the frontmatter — just the markdown body
- Do NOT use emojis
- If discussing other products or companies, be fair and accurate`,
            input: `Write a blog post with this title: "${title}"

Angle: ${angle}

Search the web for accurate, current information about this topic. Write the full blog post body in markdown.`
        })

        return res.output_text
    }
}

export default openaiHelpers