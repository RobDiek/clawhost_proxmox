import type { UseURLStateRestorationParams } from '@/ts/Interfaces'
import type { ClawDetailTab } from '@/ts/Types'

import { useEffect, useRef } from 'react'
import { t } from '@openclaw/i18n'
import { TOAST_TYPE } from '@/lib/constants'
import { CLAW_DETAIL_TABS, fireConfetti } from '@/lib'

const useURLStateRestoration = (params: UseURLStateRestorationParams): void => {
    const {
        searchParams,
        setSearchParams,
        chatSettingsClawId,
        setChatSettingsClawId,
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
            const settings = searchParams.get('settings')
            const tab = searchParams.get('tab')
            if (settings) preserved.settings = settings
            if (tab) preserved.tab = tab
            setSearchParams(preserved, { replace: true })
        }
    }, [searchParams, setSearchParams])

    useEffect(() => {
        const tabParam = searchParams.get('tab') as ClawDetailTab | null
        const settingsParam = searchParams.get('settings')

        if (!settingsParam) return

        isRestoringFromUrl.current = true

        const validClawTabs: ClawDetailTab[] = [
            CLAW_DETAIL_TABS.OVERVIEW,
            CLAW_DETAIL_TABS.PREVIEW,
            CLAW_DETAIL_TABS.TERMINAL,
            CLAW_DETAIL_TABS.LOGS,
            CLAW_DETAIL_TABS.VERSIONS,
            CLAW_DETAIL_TABS.FILES,
            CLAW_DETAIL_TABS.MONITOR,
            CLAW_DETAIL_TABS.VOLUMES,
            CLAW_DETAIL_TABS.SERVER,
            CLAW_DETAIL_TABS.SECURITY,
            CLAW_DETAIL_TABS.BILLING,
            CLAW_DETAIL_TABS.SETTINGS
        ]

        if (settingsParam) {
            setChatSettingsClawId(settingsParam)
            setChatClawTab(
                tabParam && validClawTabs.includes(tabParam)
                    ? tabParam
                    : CLAW_DETAIL_TABS.OVERVIEW
            )
        }

        requestAnimationFrame(() => {
            isRestoringFromUrl.current = false
        })
    }, [])

    useEffect(() => {
        if (isRestoringFromUrl.current) return
        const urlParams: Record<string, string> = {}
        if (chatSettingsClawId) {
            urlParams.settings = chatSettingsClawId
            if (chatClawTab) urlParams.tab = chatClawTab
        }
        setSearchParams(urlParams, { replace: true })
    }, [chatSettingsClawId, chatClawTab])
}

export default useURLStateRestoration