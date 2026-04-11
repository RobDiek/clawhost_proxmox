import versionCache from '@/controllers/agents/helpers/versionCache'

const invalidateVersionCache = (ip: string): void => {
    versionCache.delete(ip)
}

export default invalidateVersionCache