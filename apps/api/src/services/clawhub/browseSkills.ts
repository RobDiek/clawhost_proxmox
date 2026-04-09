import type {
    ClawHubAPISkillItem,
    ClawHubAPISkillsPage,
    ClawHubSearchResult,
    ClawHubBrowseResultPage,
    BrowseClawHubSkillsParams,
    SkillsCacheEntry
} from '@/ts/Interfaces'

import { RequestClient, inputValidation, externalUrls } from '@openclaw/shared'

const CACHE_TTL = 60 * 60 * 1000

const client = new RequestClient({
    baseUrl: externalUrls.CLAWHUB.API
})

let skillsCache: SkillsCacheEntry | null = null

const mapSkillItem = (item: ClawHubAPISkillItem): ClawHubSearchResult => ({
    slug: item.slug.toLowerCase(),
    name: item.displayName || item.slug,
    description: item.summary || '',
    author: item.author || '',
    version: item.version || '',
    downloads: item.downloads || 0,
    tags: item.tags || []
})

const fetchAllSkills = async (): Promise<ClawHubSearchResult[]> => {
    if (skillsCache && Date.now() < skillsCache.expires) {
        return skillsCache.data
    }

    const allItems: ClawHubAPISkillItem[] = []
    let cursor: string | null = null

    while (true) {
        const url: string = cursor
            ? `/skills?limit=200&cursor=${encodeURIComponent(cursor)}`
            : '/skills?limit=200'

        const response: ClawHubAPISkillsPage =
            await client.get<ClawHubAPISkillsPage>(url)
        const items = response.items || []
        allItems.push(...items)

        if (!response.nextCursor || items.length === 0) break

        cursor = response.nextCursor
    }

    const skills = allItems.map(mapSkillItem)
    skillsCache = { data: skills, expires: Date.now() + CACHE_TTL }
    return skills
}

const browseSkills = async (
    params: BrowseClawHubSkillsParams
): Promise<ClawHubBrowseResultPage> => {
    const limit = params.limit || inputValidation.SKILLS_DEFAULT_LIMIT.DEFAULT
    const offset = params.cursor ? Number(params.cursor) : 0
    const query = (params.query || '').trim()

    const allSkills = await fetchAllSkills()

    let filtered = allSkills
    if (query) {
        const q = query.toLowerCase()
        filtered = allSkills.filter(
            (s) =>
                s.name.toLowerCase().includes(q) ||
                s.description.toLowerCase().includes(q) ||
                s.slug.toLowerCase().includes(q)
        )
    }

    const page = filtered.slice(offset, offset + limit)
    const hasMore = offset + limit < filtered.length

    return {
        skills: page,
        nextCursor: hasMore ? String(offset + limit) : null,
        hasMore
    }
}

export default browseSkills