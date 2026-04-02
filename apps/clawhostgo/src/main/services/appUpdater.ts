import type { AppUpdateInfo } from '@/ts/Interfaces'

import { net, app } from 'electron'

const GITHUB_REPO = 'bfzli/clawhost'
const RELEASES_URL = `https://api.github.com/repos/${GITHUB_REPO}/releases`
const CHECK_INTERVAL = 60 * 60 * 1000

let cachedUpdate: AppUpdateInfo | null = null
let lastCheck = 0

const compareVersions = (current: string, latest: string): boolean => {
    const c = current.replace(/^v/, '').split('.').map(Number)
    const l = latest.replace(/^v/, '').split('.').map(Number)
    for (let i = 0; i < Math.max(c.length, l.length); i++) {
        const cv = c[i] || 0
        const lv = l[i] || 0
        if (lv > cv) return true
        if (lv < cv) return false
    }
    return false
}

const checkForUpdate = async (): Promise<AppUpdateInfo> => {
    const now = Date.now()
    if (cachedUpdate && now - lastCheck < CHECK_INTERVAL) {
        return cachedUpdate
    }

    try {
        const response = await net.fetch(RELEASES_URL, {
            headers: { Accept: 'application/vnd.github.v3+json' }
        })

        if (!response.ok) {
            return { hasUpdate: false, currentVersion: app.getVersion() }
        }

        const releases = await response.json()
        const goRelease = releases.find(
            (r: { tag_name: string; draft: boolean; prerelease: boolean }) =>
                r.tag_name.startsWith('go-v') && !r.draft && !r.prerelease
        )

        if (!goRelease) {
            cachedUpdate = {
                hasUpdate: false,
                currentVersion: app.getVersion()
            }
            lastCheck = now
            return cachedUpdate
        }

        const latestVersion = goRelease.tag_name.replace('go-v', '')
        const currentVersion = app.getVersion()
        const hasUpdate = compareVersions(currentVersion, latestVersion)

        const downloadUrl = goRelease.html_url as string

        cachedUpdate = {
            hasUpdate,
            currentVersion,
            latestVersion,
            downloadUrl
        }
        lastCheck = now
        return cachedUpdate
    } catch {
        return { hasUpdate: false, currentVersion: app.getVersion() }
    }
}

const appUpdater = { checkForUpdate }

export default appUpdater