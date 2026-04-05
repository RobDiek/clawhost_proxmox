import type { FC, ReactNode } from 'react'
import type {
    AgentConfigResponse,
    ClawAgentsResponse,
    PlaygroundAgentDetailPanelProps,
    PlaygroundTabConfig
} from '@/ts/Interfaces'
import type { PlaygroundAgentDetailTab } from '@/ts/Types'
import type { TranslationKey } from '@openclaw/i18n'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { AGENT_DETAIL_TABS } from '@/lib/constants'
import { motion, AnimatePresence } from 'framer-motion'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { t } from '@openclaw/i18n'
import {
    ChatCircleIcon,
    GearSixIcon,
    LightningIcon,
    ChatsCircleIcon
} from '@phosphor-icons/react'
import {
    AgentChat,
    PlaygroundSkillsContent,
    PlaygroundBindingsContent
} from '@/components/playground'
import {
    AgentDetailHeader,
    AgentDetailConfigTab,
    AgentDeleteDialog
} from '@/components/playground/agent-detail'
import { api } from '@/lib'
import { useUIStore } from '@/lib/store'
import { TOAST_TYPE } from '@/lib/constants'
import { aiModels } from '@/lib/claw-utils'
import { PLAYGROUND_AGENTS_QUERY_KEY, AGENT_CONFIG_QUERY_KEY } from '@/hooks'

const agentTabStateMap: Record<string, PlaygroundAgentDetailTab> = {}
const deletingAgentIds = new Set<string>()
let skipAgentDeleteConfirmation = false

const tabs: PlaygroundTabConfig<PlaygroundAgentDetailTab>[] = [
    {
        id: AGENT_DETAIL_TABS.CHAT,
        label: 'playground.tabChat',
        icon: ChatCircleIcon
    },
    {
        id: AGENT_DETAIL_TABS.CHANNELS,
        label: 'playground.tabChannels',
        icon: ChatsCircleIcon
    },
    {
        id: AGENT_DETAIL_TABS.SKILLS,
        label: 'playground.tabSkills',
        icon: LightningIcon
    },
    {
        id: AGENT_DETAIL_TABS.CONFIGURATION,
        label: 'playground.tabSettings',
        icon: GearSixIcon
    }
]

const PlaygroundAgentDetailPanel: FC<PlaygroundAgentDetailPanelProps> = ({
    agent,
    clawId,
    clawName,
    isOnlyAgent,
    onClose,
    readOnly,
    gatewayToken,
    subdomain,
    initialTab,
    onTabChange,
    hideChatTab,
    onGoToVersions
}): ReactNode => {
    const visibleTabs = useMemo(
        () =>
            hideChatTab
                ? tabs.filter((tab) => tab.id !== AGENT_DETAIL_TABS.CHAT)
                : tabs,
        [hideChatTab]
    )
    const defaultTab = hideChatTab
        ? AGENT_DETAIL_TABS.CHANNELS
        : AGENT_DETAIL_TABS.CHAT
    const rawActiveTab = agentTabStateMap[agent.id] || defaultTab
    const activeTab =
        hideChatTab && rawActiveTab === AGENT_DETAIL_TABS.CHAT
            ? AGENT_DETAIL_TABS.CHANNELS
            : rawActiveTab
    const setActiveTab = useCallback(
        (tab: PlaygroundAgentDetailTab) => {
            agentTabStateMap[agent.id] = tab
            setRenderKey((k) => k + 1)
            if (onTabChange) onTabChange(tab)
        },
        [agent.id, onTabChange]
    )

    useEffect(() => {
        if (initialTab && initialTab !== agentTabStateMap[agent.id]) {
            agentTabStateMap[agent.id] = initialTab
            setRenderKey((k) => k + 1)
        }
    }, [initialTab, agent.id])
    const [, setRenderKey] = useState(0)
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
    const [isExpanded, setIsExpanded] = useState(false)
    const [, setDeleteRenderKey] = useState(0)
    const { showToast } = useUIStore()
    const queryClient = useQueryClient()
    const isDeleting = deletingAgentIds.has(agent.id)

    const mockConfigData: AgentConfigResponse | undefined = readOnly
        ? {
              agent: {
                  id: agent.id,
                  name: agent.name,
                  model: agent.model
              },
              envVars: agent.model
                  ? {
                        [aiModels.find((m) => m.id === agent.model)?.envVar ||
                        '']: 'sk-••••••••'
                    }
                  : {},
              defaultModel: agent.model
          }
        : undefined

    const {
        data: queryConfigData,
        isLoading: isConfigLoading,
        isError: isConfigError
    } = useQuery({
        queryKey: [...AGENT_CONFIG_QUERY_KEY, clawId, agent.id],
        queryFn: () => api.getClawAgentConfig(clawId, agent.id),
        enabled: activeTab === AGENT_DETAIL_TABS.CONFIGURATION && !readOnly,
        staleTime: 0,
        gcTime: 0,
        retry: 1
    })

    const configData = readOnly ? mockConfigData : queryConfigData

    useEffect(() => {
        if (activeTab !== AGENT_DETAIL_TABS.CONFIGURATION) {
            queryClient.removeQueries({
                queryKey: [...AGENT_CONFIG_QUERY_KEY, clawId, agent.id]
            })
        }
    }, [activeTab, queryClient, clawId, agent.id])

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
                    hideChatTab={hideChatTab}
                    activeTab={activeTab}
                    onToggleExpand={() => setIsExpanded(!isExpanded)}
                    onDeleteClick={handleDeleteClick}
                    onClose={onClose}
                />

                <AnimatePresence>
                    {!isExpanded && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2, ease: 'easeInOut' }}
                            className='overflow-hidden'
                        >
                            <div className='border-border flex border-b'>
                                {visibleTabs.map((tab) => (
                                    <button
                                        key={tab.id}
                                        onClick={() => setActiveTab(tab.id)}
                                        className={`flex flex-1 items-center justify-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
                                            activeTab === tab.id
                                                ? 'text-foreground border-[#ef5350]'
                                                : 'text-muted-foreground hover:text-foreground/80 border-transparent'
                                        }`}
                                    >
                                        <tab.icon className='h-3.5 w-3.5' />
                                        {t(tab.label as TranslationKey)}
                                    </button>
                                ))}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                <div className='flex min-h-0 flex-1 flex-col overflow-hidden'>
                    {(isExpanded || activeTab === AGENT_DETAIL_TABS.CHAT) && (
                        <AgentChat
                            agentId={agent.id}
                            agentName={agent.name}
                            clawId={clawId}
                            subdomain={subdomain}
                            gatewayToken={gatewayToken}
                            agentModel={agent.model}
                            readOnly={readOnly}
                        />
                    )}

                    {!isExpanded &&
                        activeTab === AGENT_DETAIL_TABS.CHANNELS && (
                            <PlaygroundBindingsContent
                                clawId={clawId}
                                agentId={agent.id}
                                onGoToVersions={onGoToVersions}
                            />
                        )}

                    {!isExpanded && activeTab === AGENT_DETAIL_TABS.SKILLS && (
                        <PlaygroundSkillsContent
                            clawId={clawId}
                            agentId={agent.id}
                            onGoToVersions={onGoToVersions}
                        />
                    )}

                    {!isExpanded &&
                        activeTab === AGENT_DETAIL_TABS.CONFIGURATION && (
                            <AgentDetailConfigTab
                                agent={agent}
                                clawId={clawId}
                                configData={configData}
                                isConfigLoading={isConfigLoading}
                                isConfigError={isConfigError}
                                readOnly={readOnly}
                            />
                        )}
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