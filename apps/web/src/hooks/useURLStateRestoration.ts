import type { UseURLStateRestorationParams } from '@/ts/Interfaces'
import type {
    DashboardTab,
    PlaygroundAgentDetailTab,
    PlaygroundDetailTab
} from '@/ts/Types'

import { useEffect, useRef } from 'react'
import { t } from '@openclaw/i18n'
import { TOAST_TYPE } from '@/lib/constants'
import {
    DASHBOARD_TABS,
    AGENT_DETAIL_TABS,
    CLAW_DETAIL_TABS,
    fireConfetti
} from '@/lib'

const useURLStateRestoration = (params: UseURLStateRestorationParams): void => {
    const {
        searchParams,
        setSearchParams,
        dashboardTab,
        setDashboardTab,
        selectedClawId,
        setSelectedClawId,
        selectedAgentId,
        setSelectedAgentId,
        selectedAgentClawId,
        setSelectedAgentClawId,
        chatSelectedAgent,
        setChatSelectedAgent,
        chatSettingsClawId,
        setChatSettingsClawId,
        chatAgentTab,
        setChatAgentTab,
        playgroundAgentTab,
        setPlaygroundAgentTab,
        playgroundClawTab,
        setPlaygroundClawTab,
        chatClawTab,
        setChatClawTab,
        setShowCreate,
        setPreselectedPlanId,
        showToast,
        awaitingClaw
    } = params

    const isRestoringFromUrl = useRef(false)

    useEffect(() => {
        if (awaitingClaw) {
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
            const tab = searchParams.get('tab')
            const agent = searchParams.get('agent')
            const claw = searchParams.get('claw')
            const agentTab = searchParams.get('agentTab')
            const clawTab = searchParams.get('clawTab')
            const settingsClaw = searchParams.get('settingsClaw')
            if (tab) preserved.tab = tab
            if (agent) preserved.agent = agent
            if (claw) preserved.claw = claw
            if (agentTab) preserved.agentTab = agentTab
            if (clawTab) preserved.clawTab = clawTab
            if (settingsClaw) preserved.settingsClaw = settingsClaw
            setSearchParams(preserved, { replace: true })
        }
    }, [searchParams, setSearchParams])

    useEffect(() => {
        const tabParam = searchParams.get('tab') as DashboardTab | null
        const agentParam = searchParams.get('agent')
        const clawParam = searchParams.get('claw')
        const agentTabParam = searchParams.get(
            'agentTab'
        ) as PlaygroundAgentDetailTab | null
        const clawTabParam = searchParams.get(
            'clawTab'
        ) as PlaygroundDetailTab | null

        if (!tabParam && !agentParam && !clawParam) return

        isRestoringFromUrl.current = true

        if (
            tabParam === DASHBOARD_TABS.CHAT ||
            tabParam === DASHBOARD_TABS.PLAYGROUND
        ) {
            setDashboardTab(tabParam)
        }

        const effectiveTab = tabParam || dashboardTab
        const settingsClawParam = searchParams.get('settingsClaw')

        const validAgentTabs: PlaygroundAgentDetailTab[] = [
            AGENT_DETAIL_TABS.CHAT,
            AGENT_DETAIL_TABS.CHANNELS,
            AGENT_DETAIL_TABS.SKILLS,
            AGENT_DETAIL_TABS.CONFIGURATION
        ]
        const validChatAgentTabs: PlaygroundAgentDetailTab[] = [
            AGENT_DETAIL_TABS.CONFIGURATION,
            AGENT_DETAIL_TABS.CHANNELS,
            AGENT_DETAIL_TABS.SKILLS
        ]
        const validClawTabs: PlaygroundDetailTab[] = [
            CLAW_DETAIL_TABS.INFO,
            CLAW_DETAIL_TABS.CHANNELS,
            CLAW_DETAIL_TABS.TERMINAL,
            CLAW_DETAIL_TABS.VARIABLES,
            CLAW_DETAIL_TABS.LOGS,
            CLAW_DETAIL_TABS.DIAGNOSTICS,
            CLAW_DETAIL_TABS.SKILLS
        ]

        if (agentParam && clawParam) {
            if (effectiveTab === DASHBOARD_TABS.CHAT) {
                setChatSelectedAgent({
                    agentId: agentParam,
                    clawId: clawParam
                })
                if (agentTabParam) {
                    setChatAgentTab(
                        validChatAgentTabs.includes(agentTabParam)
                            ? agentTabParam
                            : AGENT_DETAIL_TABS.CONFIGURATION
                    )
                }
            } else {
                setSelectedAgentId(agentParam)
                setSelectedAgentClawId(clawParam)
                setSelectedClawId(null)
                if (agentTabParam) {
                    setPlaygroundAgentTab(
                        validAgentTabs.includes(agentTabParam)
                            ? agentTabParam
                            : AGENT_DETAIL_TABS.CHAT
                    )
                }
            }
        } else if (clawParam && effectiveTab === DASHBOARD_TABS.PLAYGROUND) {
            setSelectedClawId(clawParam)
            setSelectedAgentId(null)
            setSelectedAgentClawId(null)
            if (clawTabParam) {
                setPlaygroundClawTab(
                    validClawTabs.includes(clawTabParam)
                        ? clawTabParam
                        : CLAW_DETAIL_TABS.INFO
                )
            }
        }

        if (effectiveTab === DASHBOARD_TABS.CHAT && settingsClawParam) {
            setChatSettingsClawId(settingsClawParam)
            if (clawTabParam) {
                setChatClawTab(
                    validClawTabs.includes(clawTabParam)
                        ? clawTabParam
                        : CLAW_DETAIL_TABS.INFO
                )
            }
        }

        requestAnimationFrame(() => {
            isRestoringFromUrl.current = false
        })
    }, [])

    useEffect(() => {
        if (isRestoringFromUrl.current) return
        const urlParams: Record<string, string> = {}
        urlParams.tab = dashboardTab
        if (dashboardTab === DASHBOARD_TABS.CHAT) {
            if (chatSelectedAgent) {
                urlParams.agent = chatSelectedAgent.agentId
                urlParams.claw = chatSelectedAgent.clawId
            }
            if (chatAgentTab) {
                urlParams.agentTab = chatAgentTab
            } else if (chatSettingsClawId) {
                urlParams.settingsClaw = chatSettingsClawId
                if (chatClawTab) urlParams.clawTab = chatClawTab
            }
        } else if (dashboardTab === DASHBOARD_TABS.PLAYGROUND) {
            if (selectedAgentId && selectedAgentClawId) {
                urlParams.agent = selectedAgentId
                urlParams.claw = selectedAgentClawId
                if (playgroundAgentTab) urlParams.agentTab = playgroundAgentTab
            } else if (selectedClawId) {
                urlParams.claw = selectedClawId
                if (playgroundClawTab) urlParams.clawTab = playgroundClawTab
            }
        }
        setSearchParams(urlParams, { replace: true })
    }, [
        dashboardTab,
        chatSelectedAgent,
        chatAgentTab,
        chatSettingsClawId,
        chatClawTab,
        selectedAgentId,
        selectedAgentClawId,
        selectedClawId,
        playgroundAgentTab,
        playgroundClawTab
    ])
}

export default useURLStateRestoration