import type { FC, ReactNode } from 'react'
import type {
    ClawAgentsResponse,
    PlaygroundAgentDetailPanelProps
} from '@/ts/Interfaces'

import { useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { t } from '@openclaw/i18n'
import { AgentChat } from '@/components/playground'
import {
    AgentDetailHeader,
    AgentDeleteDialog
} from '@/components/playground/agent-detail'
import { api } from '@/lib'
import { useUIStore } from '@/lib/store'
import { TOAST_TYPE } from '@/lib/constants'
import { PLAYGROUND_AGENTS_QUERY_KEY } from '@/hooks'
import { useQueryClient } from '@tanstack/react-query'

const deletingAgentIds = new Set<string>()
let skipAgentDeleteConfirmation = false

const PlaygroundAgentDetailPanel: FC<PlaygroundAgentDetailPanelProps> = ({
    agent,
    clawId,
    clawName,
    isOnlyAgent,
    onClose,
    readOnly,
    gatewayToken,
    subdomain
}): ReactNode => {
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
    const [isExpanded, setIsExpanded] = useState(false)
    const [, setDeleteRenderKey] = useState(0)
    const { showToast } = useUIStore()
    const queryClient = useQueryClient()
    const isDeleting = deletingAgentIds.has(agent.id)

    const executeDelete = useCallback(() => {
        const agentId = agent.id
        deletingAgentIds.add(agentId)
        setShowDeleteConfirm(false)
        setDeleteRenderKey((k) => k + 1)

        api.deleteClawAgent(clawId, { agentId })
            .then(() => {
                showToast(
                    t('playground.deleteAgentSuccess'),
                    TOAST_TYPE.SUCCESS
                )
                queryClient.setQueryData<ClawAgentsResponse>(
                    [PLAYGROUND_AGENTS_QUERY_KEY, clawId],
                    (old) => {
                        if (!old) return old
                        return {
                            ...old,
                            agents: old.agents.filter((a) => a.id !== agentId)
                        }
                    }
                )
                onClose()
            })
            .catch(() => {
                showToast(t('playground.deleteAgentFailed'), TOAST_TYPE.ERROR)
            })
            .finally(() => {
                deletingAgentIds.delete(agentId)
            })
    }, [agent.id, clawId, showToast, queryClient, onClose])

    const handleDeleteClick = useCallback(() => {
        if (skipAgentDeleteConfirmation) {
            executeDelete()
        } else {
            setShowDeleteConfirm(true)
        }
    }, [executeDelete])

    const handleConfirmDelete = useCallback(
        (skipFuture: boolean) => {
            if (skipFuture) {
                skipAgentDeleteConfirmation = true
            }
            executeDelete()
        },
        [executeDelete]
    )

    return (
        <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.2 }}
            className={
                isExpanded
                    ? 'fixed inset-0 z-50 overflow-hidden'
                    : 'fixed inset-0 z-40 overflow-hidden md:relative md:inset-auto md:z-auto md:h-full md:w-[380px] md:shrink-0'
            }
        >
            <div className='bg-background md:border-border md:bg-background/95 flex h-full w-full flex-col md:border-l md:backdrop-blur-xl'>
                <AgentDetailHeader
                    agent={agent}
                    clawName={clawName}
                    isOnlyAgent={isOnlyAgent}
                    isExpanded={isExpanded}
                    isDeleting={isDeleting}
                    readOnly={readOnly}
                    onToggleExpand={() => setIsExpanded(!isExpanded)}
                    onDeleteClick={handleDeleteClick}
                    onClose={onClose}
                />

                <div className='flex min-h-0 flex-1 flex-col overflow-hidden'>
                    <AgentChat
                        agentId={agent.id}
                        agentName={agent.name}
                        clawId={clawId}
                        subdomain={subdomain}
                        gatewayToken={gatewayToken}
                        agentModel={agent.model}
                        readOnly={readOnly}
                    />
                </div>
            </div>

            <AgentDeleteDialog
                open={showDeleteConfirm}
                onOpenChange={setShowDeleteConfirm}
                agentName={agent.name}
                onConfirm={handleConfirmDelete}
            />
        </motion.div>
    )
}

export default PlaygroundAgentDetailPanel