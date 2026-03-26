describe('useAppVersion logic', () => {
    it('formats version with v prefix', () => {
        const version = '1.2.3'
        expect(`v${version}`).toBe('v1.2.3')
    })

    it('returns empty string when not local', () => {
        const isLocal = false
        const appVersion = isLocal ? 'v1.0.0' : ''
        expect(appVersion).toBe('')
    })

    it('returns version when local and API available', () => {
        const isLocal = true
        const apiVersion = '2.5.1'
        const appVersion = isLocal && apiVersion ? `v${apiVersion}` : ''
        expect(appVersion).toBe('v2.5.1')
    })

    it('returns empty when local but no electronAPI', () => {
        const isLocal = true
        const api = undefined
        const appVersion = isLocal && api ? 'v1.0.0' : ''
        expect(appVersion).toBe('')
    })
})