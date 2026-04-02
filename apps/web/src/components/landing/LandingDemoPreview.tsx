import type { FC, ReactNode } from 'react'
import type { ClawWithAgents, LandingDemoPreviewProps } from '@/ts/Interfaces'
import type { DashboardTab } from '@/ts/Types'

import { Fragment, useState, useEffect, useMemo } from 'react'
import { AnimatePresence } from 'framer-motion'
import { t } from '@openclaw/i18n'
import { Logo } from '@/components/layout'

import { demoPlaygroundData } from '@/data'
import {
    PlaygroundCanvas,
    PlaygroundDetailPanel,
    PlaygroundAgentDetailPanel,
    AgentChat
} from '@/components/playground'
import { ChatSidebar, ChatEmptyState } from '@/components/chat'
import { DASHBOARD_TABS, getBaseDomain } from '@/lib'
import { LockIcon, ChatCircleDotsIcon, GraphIcon } from '@phosphor-icons/react'

const LandingDemoPreview: FC<LandingDemoPreviewProps> = ({
    urlOverride,
    hideTitleBar = false
}): ReactNode => {
    const [isMobile, setIsMobile] = useState(
        typeof window !== 'undefined' && window.innerWidth < 768
    )

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 768)
        window.addEventListener('resize', handleResize)
        return () => window.removeEventListener('resize', handleResize)
    }, [])

    const mobileDemoData = useMemo(() => {
        if (!isMobile) return demoPlaygroundData
        const keepAgentId = 'agent-1a'
        const nodes = demoPlaygroundData.nodes
            .filter((n) => {
                if (n.type !== 'agentNode') return true
                const data = n.data as Record<string, unknown>
                const agent = data.agent as Record<string, unknown>
                return agent?.id === keepAgentId
            })
            .map((n) => {
                if (n.type === 'clawNode') {
                    return {
                        ...n,
                        data: { ...n.data, agentCount: 1 },
                        position: { x: 0, y: 0 }
                    }
                }
                return { ...n, position: { x: 20, y: 170 } }
            })
        const nodeIds = new Set(nodes.map((n) => n.id))
        const edges = demoPlaygroundData.edges.filter(
            (e) => nodeIds.has(e.source) && nodeIds.has(e.target)
        )
        const agentsByClawId: Record<
            string,
            (typeof demoPlaygroundData.agentsByClawId)[string]
        > = {}
        for (const [clawId, agents] of Object.entries(
            demoPlaygroundData.agentsByClawId
        )) {
            agentsByClawId[clawId] = agents.filter((a) => a.id === keepAgentId)
        }
        return { ...demoPlaygroundData, nodes, edges, agentsByClawId }
    }, [isMobile])

    const [demoPreviewTab, setDemoPreviewTab] = useState<DashboardTab>(
        DASHBOARD_TABS.CHAT
    )
    const [demoClawId, setDemoClawId] = useState<string | null>(null)
    const [demoAgentId, setDemoAgentId] = useState<string | null>(null)
    const [demoAgentClawId, setDemoAgentClawId] = useState<string | null>(null)
    const [demoChatAgentId, setDemoChatAgentId] = useState<string | null>(
        'agent-1a'
    )
    const [demoChatSettingsClawId, setDemoChatSettingsClawId] = useState<
        string | null
    >(null)
    const [demoChatConfigAgentId, setDemoChatConfigAgentId] = useState<
        string | null
    >(null)
    const [demoChatConfigClawId, setDemoChatConfigClawId] = useState<
        string | null
    >(null)

    const demoClaw = demoClawId
        ? mobileDemoData.claws.find((c) => c.id === demoClawId) || null
        : null

    const demoAgentClaw = demoAgentClawId
        ? mobileDemoData.claws.find((c) => c.id === demoAgentClawId) || null
        : null

    const demoAgentList = demoAgentClaw
        ? mobileDemoData.agentsByClawId[demoAgentClaw.id] || []
        : []

    const demoAgent = demoAgentId
        ? demoAgentList.find((a) => a.id === demoAgentId) || null
        : null

    const demoChatClaw = mobileDemoData.claws[0]
    const demoChatAgents = demoChatClaw
        ? mobileDemoData.agentsByClawId[demoChatClaw.id] || []
        : []
    const demoChatAgent = demoChatAgentId
        ? demoChatAgents.find((a) => a.id === demoChatAgentId) || null
        : null

    const demoChatClawsWithAgents = useMemo((): ClawWithAgents[] => {
        return mobileDemoData.claws.map((claw) => ({
            claw,
            agents: mobileDemoData.agentsByClawId[claw.id] || [],
            isLoading: false,
            isReachable: true
        }))
    }, [mobileDemoData])

    const demoChatSettingsClaw = demoChatSettingsClawId
        ? mobileDemoData.claws.find((c) => c.id === demoChatSettingsClawId) ||
          null
        : null
    const demoChatConfigClaw = demoChatConfigClawId
        ? mobileDemoData.claws.find((c) => c.id === demoChatConfigClawId) ||
          null
        : null
    const demoChatConfigAgentList = demoChatConfigClaw
        ? mobileDemoData.agentsByClawId[demoChatConfigClaw.id] || []
        : []
    const demoChatConfigAgent = demoChatConfigAgentId
        ? demoChatConfigAgentList.find((a) => a.id === demoChatConfigAgentId) ||
          null
        : null

    return (
        <Fragment>
            {!hideTitleBar && (
                <div className='border-border from-muted to-muted/80 pointer-events-none flex items-center gap-3 border-b bg-gradient-to-b px-5 py-3'>
                    <div className='flex items-center gap-2'>
                        <div className='h-3 w-3 rounded-full bg-[#ff5f57] shadow-[inset_0_-1px_2px_rgba(0,0,0,0.2)]' />
                        <div className='h-3 w-3 rounded-full bg-[#febc2e] shadow-[inset_0_-1px_2px_rgba(0,0,0,0.2)]' />
                        <div className='h-3 w-3 rounded-full bg-[#28c840] shadow-[inset_0_-1px_2px_rgba(0,0,0,0.2)]' />
                    </div>
                    <div className='flex flex-1 justify-center'>
                        {urlOverride ? (
                            <span className='text-muted-foreground text-xs'>
                                {urlOverride}
                            </span>
                        ) : (
                            <div className='text-muted-foreground bg-foreground/10 flex items-center gap-2 rounded-lg px-4 py-1.5 text-xs'>
                                <LockIcon
                                    className='h-3 w-3 text-green-500/70'
                                    weight='fill'
                                />
                                <span>{`${getBaseDomain()}/claws`}</span>
                            </div>
                        )}
                    </div>
                    <div className='w-[56px]' />
                </div>
            )}

            <div className='border-border bg-background/80 flex items-center justify-between border-b px-4 py-2'>
                <div className='flex items-center gap-2'>
                    <div className='-mr-4 origin-left scale-[0.85]'>
                        <Logo />
                    </div>
                    <div className='border-border flex items-center rounded-lg border p-0.5'>
                        <button
                            onClick={() =>
                                setDemoPreviewTab(DASHBOARD_TABS.CHAT)
                            }
                            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${demoPreviewTab === DASHBOARD_TABS.CHAT ? 'bg-foreground/10 text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                        >
                            <ChatCircleDotsIcon
                                className='h-3.5 w-3.5'
                                weight={
                                    demoPreviewTab === DASHBOARD_TABS.CHAT
                                        ? 'fill'
                                        : 'regular'
                                }
                            />
                            <span className='hidden sm:inline'>
                                {t('dashboard.chatTab')}
                            </span>
                        </button>
                        <button
                            onClick={() =>
                                setDemoPreviewTab(DASHBOARD_TABS.PLAYGROUND)
                            }
                            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${demoPreviewTab === DASHBOARD_TABS.PLAYGROUND ? 'bg-foreground/10 text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                        >
                            <GraphIcon
                                className='h-3.5 w-3.5'
                                weight={
                                    demoPreviewTab === DASHBOARD_TABS.PLAYGROUND
                                        ? 'fill'
                                        : 'regular'
                                }
                            />
                            <span className='hidden sm:inline'>
                                {t('dashboard.playgroundTab')}
                            </span>
                        </button>
                    </div>
                </div>
            </div>

            <div className='flex flex-1 overflow-hidden'>
                {demoPreviewTab === DASHBOARD_TABS.PLAYGROUND ? (
                    <div className='relative flex min-w-0 flex-1 overflow-hidden'>
                        <div className='relative min-w-0 flex-1'>
                            <div className='playground-grid h-full'>
                                <PlaygroundCanvas
                                    initialNodes={mobileDemoData.nodes}
                                    initialEdges={mobileDemoData.edges}
                                    initialZoom={1.25}
                                    allowPageScroll
                                    onNodeClick={(clawId) => {
                                        setDemoAgentId(null)
                                        setDemoAgentClawId(null)
                                        setDemoClawId(
                                            demoClawId === clawId
                                                ? null
                                                : clawId
                                        )
                                    }}
                                    onAgentClick={(agentId, clawId) => {
                                        setDemoClawId(null)
                                        setDemoAgentId(
                                            demoAgentId === agentId
                                                ? null
                                                : agentId
                                        )
                                        setDemoAgentClawId(clawId)
                                    }}
                                    onPaneClick={() => {
                                        setDemoClawId(null)
                                        setDemoAgentId(null)
                                        setDemoAgentClawId(null)
                                    }}
                                    panelOpen={!!demoClaw || !!demoAgent}
                                    selectedClawId={demoClawId}
                                    selectedAgentId={demoAgentId}
                                />
                            </div>
                        </div>

                        <AnimatePresence>
                            {demoClaw && (
                                <PlaygroundDetailPanel
                                    key='detail-panel'
                                    claw={demoClaw}
                                    plans={[]}
                                    sshKeys={[]}
                                    onClose={() => setDemoClawId(null)}
                                    readOnly
                                />
                            )}

                            {demoAgent && demoAgentClaw && (
                                <PlaygroundAgentDetailPanel
                                    key='agent-panel'
                                    agent={demoAgent}
                                    clawId={demoAgentClaw.id}
                                    clawName={demoAgentClaw.name}
                                    isOnlyAgent={demoAgentList.length <= 1}
                                    onClose={() => {
                                        setDemoAgentId(null)
                                        setDemoAgentClawId(null)
                                    }}
                                    readOnly
                                />
                            )}
                        </AnimatePresence>
                    </div>
                ) : (
                    <div className='relative flex min-w-0 flex-1 overflow-hidden'>
                        <div className='playground-grid pointer-events-none absolute inset-0 opacity-50' />
                        <ChatSidebar
                            clawsWithAgents={demoChatClawsWithAgents}
                            selectedAgent={
                                demoChatAgentId && demoChatClaw
                                    ? {
                                          agentId: demoChatAgentId,
                                          clawId: demoChatClaw.id
                                      }
                                    : null
                            }
                            configAgent={null}
                            selectedClawId={demoChatSettingsClawId}
                            readOnly
                            onAgentSelect={(selection) => {
                                setDemoChatAgentId(
                                    demoChatAgentId === selection.agentId
                                        ? null
                                        : selection.agentId
                                )
                                setDemoChatSettingsClawId(null)
                                setDemoChatConfigAgentId(null)
                                setDemoChatConfigClawId(null)
                            }}
                            onConfigureAgent={(agentId, clawId) => {
                                setDemoChatConfigAgentId(agentId)
                                setDemoChatConfigClawId(clawId)
                                setDemoChatSettingsClawId(null)
                            }}
                            onCreateAgent={() => {}}
                            onOpenClawSettings={(clawId) => {
                                setDemoChatSettingsClawId(
                                    demoChatSettingsClawId === clawId
                                        ? null
                                        : clawId
                                )
                                setDemoChatAgentId(null)
                                setDemoChatConfigAgentId(null)
                                setDemoChatConfigClawId(null)
                            }}
                        />
                        <div className='relative flex min-h-0 min-w-0 flex-1 translate-x-0 overflow-hidden'>
                            <div className='min-w-0 flex-1'>
                                {demoChatSettingsClaw && !demoChatAgentId ? (
                                    <PlaygroundDetailPanel
                                        key={`chat-settings-${demoChatSettingsClaw.id}`}
                                        claw={demoChatSettingsClaw}
                                        plans={[]}
                                        sshKeys={[]}
                                        onClose={() =>
                                            setDemoChatSettingsClawId(null)
                                        }
                                        readOnly
                                        fullScreen
                                    />
                                ) : demoChatAgent ? (
                                    <AgentChat
                                        key={demoChatAgent.id}
                                        agentId={demoChatAgent.id}
                                        agentName={demoChatAgent.name}
                                        clawId={demoChatClaw.id}
                                        subdomain={null}
                                        gatewayToken={null}
                                        agentModel={demoChatAgent.model}
                                        readOnly
                                    />
                                ) : (
                                    <ChatEmptyState />
                                )}
                            </div>
                            <AnimatePresence>
                                {demoChatConfigAgent && demoChatConfigClaw && (
                                    <PlaygroundAgentDetailPanel
                                        key={`chat-config-${demoChatConfigAgent.id}`}
                                        agent={demoChatConfigAgent}
                                        clawId={demoChatConfigClaw.id}
                                        clawName={demoChatConfigClaw.name}
                                        isOnlyAgent={
                                            demoChatConfigAgentList.length <= 1
                                        }
                                        onClose={() => {
                                            setDemoChatConfigAgentId(null)
                                            setDemoChatConfigClawId(null)
                                        }}
                                        readOnly
                                        hideChatTab
                                        initialTab='configuration'
                                    />
                                )}
                            </AnimatePresence>
                        </div>
                    </div>
                )}
            </div>
        </Fragment>
    )
}

export default LandingDemoPreview