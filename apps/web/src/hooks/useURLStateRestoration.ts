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
            const settingsClaw = searchParams.get('settingsClaw')
            const clawTab = searchParams.get('clawTab')
            if (settingsClaw) preserved.settingsClaw = settingsClaw
            if (clawTab) preserved.clawTab = clawTab
            setSearchParams(preserved, { replace: true })
        }
    }, [searchParams, setSearchParams])

    useEffect(() => {
        const clawTabParam = searchParams.get('clawTab') as ClawDetailTab | null
        const settingsClawParam = searchParams.get('settingsClaw')

        if (!settingsClawParam) return

        isRestoringFromUrl.current = true

        const validClawTabs: ClawDetailTab[] = [
            CLAW_DETAIL_TABS.INFO,
            CLAW_DETAIL_TABS.TERMINAL,
            CLAW_DETAIL_TABS.LOGS,
            CLAW_DETAIL_TABS.DIAGNOSTICS
        ]

        if (settingsClawParam) {
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
        if (chatSettingsClawId) {
            urlParams.settingsClaw = chatSettingsClawId
            if (chatClawTab) urlParams.clawTab = chatClawTab
        }
        setSearchParams(urlParams, { replace: true })
    }, [chatSettingsClawId, chatClawTab])
}

export default useURLStateRestoration