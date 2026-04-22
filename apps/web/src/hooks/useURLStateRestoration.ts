import type { UseURLStateRestorationParams } from '@/ts/Interfaces'
import type { AgentDetailTab } from '@/ts/Types'

import { useEffect, useRef } from 'react'
import { t } from '@openclaw/i18n'
import { TOAST_TYPE } from '@/lib/constants'
import { AGENT_DETAIL_TABS, fireConfetti } from '@/lib'

const useURLStateRestoration = (params: UseURLStateRestorationParams): void => {
    const {
        searchParams,
        setSearchParams,
        chatSettingsAgentId,
        setChatSettingsAgentId,
        chatAgentTab,
        setChatAgentTab,
        setShowCreate,
        setPreselectedPlanId,
        showToast,
        awaitingAgent
    } = params

    const isRestoringFromUrl = useRef(false)

    useEffect(() => {
        if (awaitingAgent) {
            showToast(t('dashboard.paymentSuccess'), TOAST_TYPE.SUCCESS)
            fireConfetti()
        }
    }, [])

    useEffect(() => {
        const planParam = searchParams.get('plan')
        const deployParam = searchParams.get('deploy')
        if (planParam) {
            setPreselectedPlanId(planParam)
            setShowCreate(true)
        } else if (deployParam) {
            setShowCreate(true)
        }
        if (planParam || deployParam || searchParams.get('payment')) {
            const preserved: Record<string, string> = {}
            const settings = searchParams.get('settings')
            const tab = searchParams.get('tab')
            if (settings) preserved.settings = settings
            if (tab) preserved.tab = tab
            setSearchParams(preserved, { replace: true })
        }
    }, [searchParams, setSearchParams])

    useEffect(() => {
        const tabParam = searchParams.get('tab') as AgentDetailTab | null
        const settingsParam = searchParams.get('settings')

        if (!settingsParam) return

        isRestoringFromUrl.current = true

        const validAgentTabs: AgentDetailTab[] = [
            AGENT_DETAIL_TABS.OVERVIEW,
            AGENT_DETAIL_TABS.PREVIEW,
            AGENT_DETAIL_TABS.TERMINAL,
            AGENT_DETAIL_TABS.LOGS,
            AGENT_DETAIL_TABS.VERSIONS,
            AGENT_DETAIL_TABS.FILES,
            AGENT_DETAIL_TABS.MONITOR,
            AGENT_DETAIL_TABS.VOLUMES,
            AGENT_DETAIL_TABS.SERVER,
            AGENT_DETAIL_TABS.SECURITY,
            AGENT_DETAIL_TABS.BILLING,
            AGENT_DETAIL_TABS.SETTINGS
        ]

        if (settingsParam) {
            setChatSettingsAgentId(settingsParam)
            setChatAgentTab(
                tabParam && validAgentTabs.includes(tabParam)
                    ? tabParam
                    : AGENT_DETAIL_TABS.OVERVIEW
            )
        }

        requestAnimationFrame(() => {
            isRestoringFromUrl.current = false
        })
    }, [])

    useEffect(() => {
        if (isRestoringFromUrl.current) return
        const urlParams: Record<string, string> = {}
        if (chatSettingsAgentId) {
            urlParams.settings = chatSettingsAgentId
            if (chatAgentTab) urlParams.tab = chatAgentTab
        }
        setSearchParams(urlParams, { replace: true })
    }, [chatSettingsAgentId, chatAgentTab])
}

export default useURLStateRestoration