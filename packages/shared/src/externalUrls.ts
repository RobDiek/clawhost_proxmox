const DOMAIN = 'clawhost.cloud'

const EXTERNAL_URLS = {
    CLAWHOST: {
        DOMAIN,
        BASE: `https://${DOMAIN}`,
        WWW: `https://www.${DOMAIN}`,
        API: `https://api.${DOMAIN}`,
        CDN: `https://cdn.${DOMAIN}`,
        subdomain: (name: string) => `https://${name}.${DOMAIN}`
    },
    GITHUB: {
        API: 'https://api.github.com',
        USER: 'https://api.github.com/user',
        USER_EMAILS: 'https://api.github.com/user/emails',
        repo: (owner: string, repo: string) => ({
            CONTENTS: (path: string, ref?: string) =>
                `https://api.github.com/repos/${owner}/${repo}/contents/${path}${ref ? `?ref=${ref}` : ''}`,
            REF: (branch: string) =>
                `https://api.github.com/repos/${owner}/${repo}/git/ref/heads/${branch}`,
            REFS: `https://api.github.com/repos/${owner}/${repo}/git/refs`,
            PULLS: `https://api.github.com/repos/${owner}/${repo}/pulls`,
            PULL_MERGE: (prNumber: string) =>
                `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}/merge`,
            DELETE_REF: (branch: string) =>
                `https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${branch}`
        })
    },
    GOOGLE: {
        USERINFO: 'https://www.googleapis.com/oauth2/v3/userinfo'
    },
    HETZNER: {
        API: 'https://api.hetzner.cloud/v1'
    },
    NPM: {
        REGISTRY: (pkg: string) => `https://registry.npmjs.org/${pkg}`,
        DOWNLOADS: (pkg: string) =>
            `https://api.npmjs.org/versions/${pkg}/last-week`
    },
    SOCIAL: {
        PRODUCT_HUNT: 'https://www.producthunt.com/posts/clawhost',
        X: 'https://x.com/tryclawhost',
        FACEBOOK: 'https://facebook.com/tryclawhost',
        INSTAGRAM: 'https://instagram.com/tryclawhost',
        THREADS: 'https://threads.net/@tryclawhost',
        YOUTUBE: 'https://youtube.com/@clawhost',
        TIKTOK: 'https://tiktok.com/@clawhost',
        GITHUB: 'https://github.com/bfzli/clawhost',
        TUTORIAL: 'https://www.youtube.com/watch?v=clawhost-tutorial',
        SUPPORT_EMAIL: 'support@clawhost.cloud'
    }
} as const

export default EXTERNAL_URLS