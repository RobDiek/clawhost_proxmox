import versionCache from '@/controllers/claws/helpers/versionCache'

const invalidateVersionCache = (ip: string): void => {
    versionCache.delete(ip)
}

export default invalidateVersionCache