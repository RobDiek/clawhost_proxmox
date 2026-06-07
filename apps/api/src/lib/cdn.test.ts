import CDN_ASSETS from '@/lib/cdn'

describe('CDN_ASSETS', () => {
    it('has LOGO_DARK url', () => {
        expect(CDN_ASSETS.LOGO_DARK).toContain('clawnode-logo-dark.png')
    })

    it('has LOGO_LIGHT url', () => {
        expect(CDN_ASSETS.LOGO_LIGHT).toContain('clawnode-logo-light.png')
    })

    it('all URLs point to cdn.clawnode.cloud', () => {
        for (const url of Object.values(CDN_ASSETS)) {
            expect(url).toMatch(/^https:\/\/cdn\.clawnode\.cloud\//)
        }
    })
})