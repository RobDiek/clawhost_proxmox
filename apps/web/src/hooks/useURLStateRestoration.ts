import type { UseURLStateRestorationParams } from '@/ts/Interfaces'
import type { DashboardTab, PlaygroundDetailTab } from '@/ts/Types'

import { useEffect, useRef } from 'react'
import { t } from '@openclaw/i18n'
import { TOAST_TYPE } from '@/lib/constants'
import { DASHBOARD_TABS, CLAW_DETAIL_TABS, fireConfetti } from '@/lib'

const useURLStateRestoration = (params: UseURLStateRestorationParams): void => {
    const {
        searchParams,
        setSearchParams,
        dashboardTab,
        setDashboardTab,
        selectedClawId,
        setSelectedClawId,
        chatSettingsClawId,
        setChatSettingsClawId,
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
            const claw = searchParams.get('claw')
            const clawTab = searchParams.get('clawTab')
            const settingsClaw = searchParams.get('settingsClaw')
            if (tab) preserved.tab = tab
            if (claw) preserved.claw = claw
            if (clawTab) preserved.clawTab = clawTab
            if (settingsClaw) preserved.settingsClaw = settingsClaw
            setSearchParams(preserved, { replace: true })
        }
    }, [searchParams, setSearchParams])

    useEffect(() => {
        const tabParam = searchParams.get('tab') as DashboardTab | null
        const clawParam = searchParams.get('claw')
        const clawTabParam = searchParams.get(
            'clawTab'
        ) as PlaygroundDetailTab | null

        if (!tabParam && !clawParam) return

        isRestoringFromUrl.current = true

        if (
            tabParam === DASHBOARD_TABS.LIST ||
            tabParam === DASHBOARD_TABS.PLAYGROUND
        ) {
            setDashboardTab(tabParam)
        }

        const effectiveTab = tabParam || dashboardTab
        const settingsClawParam = searchParams.get('settingsClaw')

        const validClawTabs: PlaygroundDetailTab[] = [
            CLAW_DETAIL_TABS.INFO,
            CLAW_DETAIL_TABS.TERMINAL,
            CLAW_DETAIL_TABS.LOGS,
            CLAW_DETAIL_TABS.DIAGNOSTICS
        ]

        if (clawParam && effectiveTab === DASHBOARD_TABS.PLAYGROUND) {
            setSelectedClawId(clawParam)
            if (clawTabParam) {
                setPlaygroundClawTab(
                    validClawTabs.includes(clawTabParam)
                        ? clawTabParam
                        : CLAW_DETAIL_TABS.INFO
                )
            }
        }

        if (effectiveTab === DASHBOARD_TABS.LIST && settingsClawParam) {
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
        if (dashboardTab === DASHBOARD_TABS.LIST) {
            if (chatSettingsClawId) {
                urlParams.settingsClaw = chatSettingsClawId
                if (chatClawTab) urlParams.clawTab = chatClawTab
            }
        } else if (dashboardTab === DASHBOARD_TABS.PLAYGROUND) {
            if (selectedClawId) {
                urlParams.claw = selectedClawId
                if (playgroundClawTab) urlParams.clawTab = playgroundClawTab
            }
        }
        setSearchParams(urlParams, { replace: true })
    }, [
        dashboardTab,
        chatSettingsClawId,
        chatClawTab,
        selectedClawId,
        playgroundClawTab
    ])
}

export default useURLStateRestoration