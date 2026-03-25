import parseClawVersion from '@/controllers/claws/helpers/parseClawVersion'

const isVersionAtLeast = (raw: string, minimum: string): boolean => {
    const current = parseClawVersion(raw)
    const min = parseClawVersion(minimum)

    for (let i = 0; i < current.length; i++) {
        if (current[i] > min[i]) return true
        if (current[i] < min[i]) return false
    }

    return true
}

export default isVersionAtLeast