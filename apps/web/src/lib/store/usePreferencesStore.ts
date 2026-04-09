import type { PreferencesState } from '@/ts/Interfaces'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { setLanguage as setI18nLanguage, loadLanguage } from '@openclaw/i18n'
import {
    AFFILIATE_PERIOD,
    CHAT_SIDEBAR_VIEW_MODE,
    DASHBOARD_TABS,
    THEMES,
    LANGUAGES
} from '@/lib/constants'
import STORAGE_KEYS from '@/lib/storageKeys'

const VALID_TABS = new Set<string>(Object.values(DASHBOARD_TABS))

const usePreferencesStore = create<PreferencesState>()(
    persist(
        (set) => ({
            adminMode: false,
            setAdminMode: (mode) => set({ adminMode: mode }),
            dashboardTab: DASHBOARD_TABS.CHAT,
            setDashboardTab: (tab) => set({ dashboardTab: tab }),
            theme: THEMES.DARK,
            setTheme: (theme) => set({ theme }),
            language: LANGUAGES.EN,
            setLanguage: (language) => {
                loadLanguage(language).then(() => {
                    setI18nLanguage(language)
                    set({ language })
                })
            },
            openLinksWindowed: false,
            setOpenLinksWindowed: (value) => set({ openLinksWindowed: value }),
            chatSidebarView: CHAT_SIDEBAR_VIEW_MODE.TREE,
            setChatSidebarView: (view) => set({ chatSidebarView: view }),
            product: 'cloud',
            setProduct: (product) => set({ product }),
            affiliatePeriod: AFFILIATE_PERIOD.ALL,
            setAffiliatePeriod: (period) => set({ affiliatePeriod: period })
        }),
        {
            name: STORAGE_KEYS.PREFERENCES,
            migrate: (persisted, version) => {
                const state = persisted as PreferencesState
                if (!VALID_TABS.has(state.dashboardTab)) {
                    state.dashboardTab = DASHBOARD_TABS.CHAT
                }
                if (version < 2) {
                    state.theme = state.theme || THEMES.SYSTEM
                }
                if (version < 3) {
                    state.language = state.language || LANGUAGES.EN
                }
                if (version < 4) {
                    state.openLinksWindowed = state.openLinksWindowed ?? false
                }
                if (version < 5) {
                    state.chatSidebarView =
                        state.chatSidebarView || CHAT_SIDEBAR_VIEW_MODE.TREE
                }
                if (version < 6) {
                    state.product = state.product || 'cloud'
                }
                if (version < 7) {
                    state.affiliatePeriod =
                        state.affiliatePeriod || AFFILIATE_PERIOD.ALL
                }
                return state
            },
            version: 7
        }
    )
)

export default usePreferencesStore