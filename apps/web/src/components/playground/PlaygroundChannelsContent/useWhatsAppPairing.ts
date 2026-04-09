import type {
    UseWhatsAppPairingParams,
    UseWhatsAppPairingReturn,
    WhatsAppPairStatusResponse
} from '@/ts/Interfaces'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { t } from '@openclaw/i18n'
import { api } from '@/lib'
import { useUIStore, useChannelsStore } from '@/lib/store'
import { TOAST_TYPE } from '@/lib/constants'
import {
    WHATSAPP_PAIR_INITIAL_QUERY_KEY,
    WHATSAPP_PAIR_STATUS_QUERY_KEY
} from '@/hooks'
import qrToDataUrl from '@/components/playground/PlaygroundChannelsContent/qrToDataUrl'

const useWhatsAppPairing = ({
    clawId,
    whatsAppEnabled
}: UseWhatsAppPairingParams): UseWhatsAppPairingReturn => {
    const {
        isPairing,
        setIsPairing,
        pollEnabled,
        setPollEnabled,
        isWhatsAppPaired,
        setIsWhatsAppPaired,
        isRepairing,
        setIsRepairing,
        initialCheckDone,
        setInitialCheckDone,
        resetPairingState
    } = useChannelsStore(
        useShallow((s) => ({
            isPairing: s.isPairing,
            setIsPairing: s.setIsPairing,
            pollEnabled: s.pollEnabled,
            setPollEnabled: s.setPollEnabled,
            isWhatsAppPaired: s.isWhatsAppPaired,
            setIsWhatsAppPaired: s.setIsWhatsAppPaired,
            isRepairing: s.isRepairing,
            setIsRepairing: s.setIsRepairing,
            initialCheckDone: s.initialCheckDone,
            setInitialCheckDone: s.setInitialCheckDone,
            resetPairingState: s.resetPairingState
        }))
    )
    const { showToast } = useUIStore()
    const queryClient = useQueryClient()

    const { data: initialPairStatus, isError: initialCheckError } =
        useQuery<WhatsAppPairStatusResponse>({
            queryKey: [...WHATSAPP_PAIR_INITIAL_QUERY_KEY, clawId],
            queryFn: () => api.pairWhatsAppStatus(clawId),
            enabled: whatsAppEnabled && !initialCheckDone && !isPairing,
            retry: false,
            staleTime: Infinity
        })

    useEffect(() => {
        if (initialCheckError) {
            setInitialCheckDone(true)
            return
        }
        if (!initialPairStatus) return
        setInitialCheckDone(true)
        if (initialPairStatus.status === 'paired') {
            setIsWhatsAppPaired(true)
        }
    }, [initialPairStatus, initialCheckError])

    const previousQrRef = useRef<string | null>(null)
    const [qrRefreshed, setQrRefreshed] = useState(false)

    const { data: pairStatus } = useQuery<WhatsAppPairStatusResponse>({
        queryKey: [...WHATSAPP_PAIR_STATUS_QUERY_KEY, clawId],
        queryFn: () => api.pairWhatsAppStatus(clawId),
        enabled: pollEnabled,
        refetchInterval: 3000
    })

    const qrImageUrl = useMemo(() => {
        if (pairStatus?.status === 'qr_ready' && pairStatus.qr)
            return qrToDataUrl(pairStatus.qr)
        return ''
    }, [pairStatus])

    useEffect(() => {
        if (!pairStatus || !isPairing) return
        if (pairStatus.status === 'paired') {
            resetPairingState()
            setIsWhatsAppPaired(true)
            showToast(
                t('playground.channelsWhatsAppPaired'),
                TOAST_TYPE.SUCCESS
            )
        }
        if (pairStatus.status === 'failed') {
            resetPairingState()
        }
    }, [
        pairStatus,
        isPairing,
        showToast,
        resetPairingState,
        setIsWhatsAppPaired
    ])

    const qrRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    useEffect(() => {
        if (pairStatus?.status === 'qr_ready' && pairStatus.qr) {
            if (
                previousQrRef.current &&
                previousQrRef.current !== pairStatus.qr
            ) {
                setQrRefreshed(true)
                if (qrRefreshTimerRef.current)
                    clearTimeout(qrRefreshTimerRef.current)
                qrRefreshTimerRef.current = setTimeout(
                    () => setQrRefreshed(false),
                    7000
                )
            }
            previousQrRef.current = pairStatus.qr
        }
        return () => {
            if (qrRefreshTimerRef.current)
                clearTimeout(qrRefreshTimerRef.current)
        }
    }, [pairStatus])

    const pairMutation = useMutation({
        mutationFn: (force: boolean | undefined) =>
            api.pairWhatsApp(clawId, force),
        onSuccess: (res) => {
            if (res.status === 'already_paired') {
                setIsWhatsAppPaired(true)
                showToast(
                    t('playground.channelsWhatsAppAlreadyPaired'),
                    'success'
                )
                return
            }
            setIsPairing(true)
            setQrRefreshed(false)
            previousQrRef.current = null
            setTimeout(() => setPollEnabled(true), 3000)
        },
        onError: () => {
            showToast(
                t('playground.channelsWhatsAppPairFailed'),
                TOAST_TYPE.ERROR
            )
        }
    })

    const triggerPair = (force?: boolean): void => {
        pairMutation.mutate(force)
    }

    const triggerRepair = (): void => {
        setIsRepairing(true)
        setIsWhatsAppPaired(false)
        queryClient.removeQueries({
            queryKey: [...WHATSAPP_PAIR_STATUS_QUERY_KEY, clawId]
        })
        queryClient.removeQueries({
            queryKey: [...WHATSAPP_PAIR_INITIAL_QUERY_KEY, clawId]
        })
        pairMutation.mutate(true)
    }

    return {
        isPairing,
        isRepairing,
        isWhatsAppPaired,
        setIsWhatsAppPaired,
        setIsRepairing,
        pairStatus,
        qrImageUrl,
        qrRefreshed,
        pairMutationPending: pairMutation.isPending,
        triggerPair,
        triggerRepair
    }
}

export default useWhatsAppPairing