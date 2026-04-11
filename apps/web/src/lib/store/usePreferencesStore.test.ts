import { usePreferencesStore } from '@/lib/store'
import { PRODUCT } from '@/lib/constants'

describe('usePreferencesStore', () => {
    beforeEach(() => {
        usePreferencesStore.setState({
            adminMode: false,
            dashboardTab: 'chat',
            theme: 'dark',
            language: 'en',
            openLinksWindowed: false,
            product: PRODUCT.CLOUD
        })
    })

    it('has correct initial defaults', () => {
        const state = usePreferencesStore.getState()
        expect(state.adminMode).toBe(false)
        expect(state.dashboardTab).toBe('chat')
        expect(state.theme).toBe('dark')
        expect(state.language).toBe('en')
        expect(state.product).toBe(PRODUCT.CLOUD)
    })

    it('toggles admin mode', () => {
        usePreferencesStore.getState().setAdminMode(true)
        expect(usePreferencesStore.getState().adminMode).toBe(true)
    })

    it('changes dashboard tab', () => {
        usePreferencesStore.getState().setDashboardTab('playground')
        expect(usePreferencesStore.getState().dashboardTab).toBe('playground')
    })

    it('changes theme', () => {
        usePreferencesStore.getState().setTheme('light')
        expect(usePreferencesStore.getState().theme).toBe('light')
    })

    it('changes product', () => {
        usePreferencesStore.getState().setProduct(PRODUCT.GO)
        expect(usePreferencesStore.getState().product).toBe(PRODUCT.GO)
    })

    it('toggles openLinksWindowed', () => {
        usePreferencesStore.getState().setOpenLinksWindowed(true)
        expect(usePreferencesStore.getState().openLinksWindowed).toBe(true)
    })
})