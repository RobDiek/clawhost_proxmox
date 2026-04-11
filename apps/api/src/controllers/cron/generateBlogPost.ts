import type { Context } from 'hono'
import type {
    BlogTopicDiscovery,
    GitHubFileEntry,
    GitHubPullRequestResponse,
    GitHubRefResponse
} from '@/ts/Interfaces'

import OpenAI from 'openai'
import { externalUrls } from '@openclaw/shared'
import { ok, fail } from '@/lib/response'

const GITHUB_OWNER = 'bfzli'
const GITHUB_REPO_NAME = 'clawhost'
const BLOG_PATH = 'apps/web/content/posts'
const BASE_BRANCH = 'Production'
const MODEL = 'gpt-4o-mini'

const github = externalUrls.GITHUB.repo(GITHUB_OWNER, GITHUB_REPO_NAME)

const GITHUB_HEADERS = (token: string) => ({
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json'
})

const getOpenAI = () => new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const slugify = (title: string): string =>
    title
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 80)

const todayDate = (): string => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const fetchExistingSlugs = async (token: string): Promise<string[]> => {
    const res = await fetch(github.CONTENTS(BLOG_PATH, BASE_BRANCH), {
        headers: GITHUB_HEADERS(token)
    })

    if (!res.ok) return []

    const files = (await res.json()) as GitHubFileEntry[]
    return files
        .filter((f) => f.name.endsWith('.mdx'))
        .map((f) => f.name.replace('.mdx', ''))
}

const discoverTrendingTopic = async (
    openai: OpenAI,
    existingSlugs: string[]
): Promise<BlogTopicDiscovery> => {
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
}

const generateBlogContent = async (
    openai: OpenAI,
    title: string,
    angle: string
): Promise<string> => {
    const res = await openai.responses.create({
        model: MODEL,
        tools: [{ type: 'web_search_preview' }],
        instructions: `You are a senior technical writer for ClawHost, the managed hosting platform for OpenClaw.

OpenClaw is an open-source AI agent framework with:
- Multi-agent architecture
- Voice capabilities (Piper TTS)
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

const getProductionSha = async (token: string): Promise<string | null> => {
    const res = await fetch(github.REF(BASE_BRANCH), {
        headers: GITHUB_HEADERS(token)
    })

    if (!res.ok) return null

    const data = (await res.json()) as GitHubRefResponse
    return data.object.sha
}

const createBranch = async (
    token: string,
    branchName: string,
    baseSha: string
): Promise<boolean> => {
    const res = await fetch(github.REFS, {
        method: 'POST',
        headers: GITHUB_HEADERS(token),
        body: JSON.stringify({
            ref: `refs/heads/${branchName}`,
            sha: baseSha
        })
    })

    return res.ok
}

const pushToGitHub = async (
    token: string,
    slug: string,
    content: string,
    branch: string
): Promise<boolean> => {
    const filePath = `${BLOG_PATH}/${slug}.mdx`
    const encoded = Buffer.from(content).toString('base64')

    const res = await fetch(github.CONTENTS(filePath), {
        method: 'PUT',
        headers: GITHUB_HEADERS(token),
        body: JSON.stringify({
            message: `blog: add "${slug}"`,
            content: encoded,
            branch
        })
    })

    return res.ok
}

const createPullRequest = async (
    token: string,
    branchName: string,
    title: string,
    slug: string
): Promise<string | null> => {
    const res = await fetch(github.PULLS, {
        method: 'POST',
        headers: GITHUB_HEADERS(token),
        body: JSON.stringify({
            title: `blog: ${title}`,
            head: branchName,
            base: BASE_BRANCH,
            body: `## Auto-generated blog post\n\n**Slug:** \`${slug}\`\n**Title:** ${title}\n\nGenerated by the ClawHost blog pipeline using OpenAI web search for trending topics.`
        })
    })

    if (!res.ok) return null

    const data = (await res.json()) as GitHubPullRequestResponse
    return data.html_url
}

const mergePullRequest = async (
    token: string,
    prUrl: string
): Promise<boolean> => {
    const prNumber = prUrl.split('/').pop()!
    const res = await fetch(github.PULL_MERGE(prNumber), {
        method: 'PUT',
        headers: GITHUB_HEADERS(token),
        body: JSON.stringify({
            merge_method: 'squash'
        })
    })

    return res.ok
}

const deleteBranch = async (
    token: string,
    branchName: string
): Promise<void> => {
    await fetch(github.DELETE_REF(branchName), {
        method: 'DELETE',
        headers: GITHUB_HEADERS(token)
    })
}

const generateBlogPost = async (c: Context) => {
    const openaiKey = process.env.OPENAI_API_KEY
    const githubToken = process.env.GITHUB_TOKEN

    if (!openaiKey || !githubToken)
        return fail(c, 'Missing OPENAI_API_KEY or GITHUB_TOKEN', 500)

    const openai = getOpenAI()
    const existingSlugs = await fetchExistingSlugs(githubToken)
    const topic = await discoverTrendingTopic(openai, existingSlugs)
    const slug = slugify(topic.title)

    if (existingSlugs.includes(slug)) {
        return fail(c, `Slug already exists: ${slug}`, 409)
    }

    const body = await generateBlogContent(openai, topic.title, topic.angle)

    const frontmatter = [
        '---',
        `title: "${topic.title.replace(/"/g, '\\"')}"`,
        `slug: ${slug}`,
        'description:',
        `    "${topic.angle.replace(/"/g, '\\"')}"`,
        'author: ClawHost',
        `publishedAt: '${todayDate()}'`,
        'tags:',
        '    - openclaw',
        '    - ai-agents',
        '    - trending',
        `coverImage: /blogs/${slug}.webp`,
        '---',
        ''
    ].join('\n')

    const fullContent = frontmatter + body

    const baseSha = await getProductionSha(githubToken)

    if (!baseSha) return fail(c, 'Failed to get Production branch SHA', 500)

    const branchName = `blog/${slug}`
    const branchCreated = await createBranch(githubToken, branchName, baseSha)

    if (!branchCreated) return fail(c, 'Failed to create branch', 500)

    const pushed = await pushToGitHub(
        githubToken,
        slug,
        fullContent,
        branchName
    )

    if (!pushed) return fail(c, 'Failed to push blog post to branch', 500)

    const prUrl = await createPullRequest(
        githubToken,
        branchName,
        topic.title,
        slug
    )

    if (!prUrl) return fail(c, 'Failed to create pull request', 500)

    const merged = await mergePullRequest(githubToken, prUrl)

    if (!merged) {
        return ok(
            c,
            { slug, title: topic.title, pr: prUrl, merged: false },
            'Blog post PR created but not merged.'
        )
    }

    await deleteBranch(githubToken, branchName)

    return ok(
        c,
        { slug, title: topic.title, pr: prUrl, merged: true },
        'Blog post generated, merged, and branch cleaned up.'
    )
}

export default generateBlogPost