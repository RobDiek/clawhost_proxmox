import { usePreferencesStore } from '@/lib/store'

describe('usePreferencesStore', () => {
    beforeEach(() => {
        usePreferencesStore.setState({
            adminMode: false,
            dashboardTab: 'chat',
            theme: 'dark',
            language: 'en',
            openLinksWindowed: false,
            chatSidebarView: 'tree',
            product: 'cloud'
        })
    })

    it('has correct initial defaults', () => {
        const state = usePreferencesStore.getState()
        expect(state.adminMode).toBe(false)
        expect(state.dashboardTab).toBe('chat')
        expect(state.theme).toBe('dark')
        expect(state.language).toBe('en')
        expect(state.chatSidebarView).toBe('tree')
        expect(state.product).toBe('cloud')
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

    it('changes chat sidebar view', () => {
        usePreferencesStore.getState().setChatSidebarView('list')
        expect(usePreferencesStore.getState().chatSidebarView).toBe('list')
    })

    it('changes product', () => {
        usePreferencesStore.getState().setProduct('go')
        expect(usePreferencesStore.getState().product).toBe('go')
    })

    it('toggles openLinksWindowed', () => {
        usePreferencesStore.getState().setOpenLinksWindowed(true)
        expect(usePreferencesStore.getState().openLinksWindowed).toBe(true)
    })
})