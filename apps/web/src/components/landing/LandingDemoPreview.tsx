import type { FC, ReactNode } from 'react'
import type { LandingDemoPreviewProps } from '@/ts/Interfaces'
import type { DashboardTab } from '@/ts/Types'

import { Fragment, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { t } from '@openclaw/i18n'
import { Logo } from '@/components/layout'

import { demoPlaygroundData } from '@/data'
import {
    PlaygroundCanvas,
    PlaygroundDetailPanel
} from '@/components/playground'
import { ChatSidebar, ChatEmptyState } from '@/components/chat'
import { DASHBOARD_TABS, getBaseDomain } from '@/lib'
import { LockIcon, ListIcon, GraphIcon } from '@phosphor-icons/react'

const LandingDemoPreview: FC<LandingDemoPreviewProps> = ({
    urlOverride,
    hideTitleBar = false
}): ReactNode => {
    const [demoPreviewTab, setDemoPreviewTab] = useState<DashboardTab>(
        DASHBOARD_TABS.LIST
    )
    const [demoClawId, setDemoClawId] = useState<string | null>(null)
    const [demoChatSettingsClawId, setDemoChatSettingsClawId] = useState<
        string | null
    >(null)

    const demoClaw = demoClawId
        ? demoPlaygroundData.claws.find((c) => c.id === demoClawId) || null
        : null

    const demoChatSettingsClaw = demoChatSettingsClawId
        ? demoPlaygroundData.claws.find(
              (c) => c.id === demoChatSettingsClawId
          ) || null
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
                                setDemoPreviewTab(DASHBOARD_TABS.LIST)
                            }
                            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${demoPreviewTab === DASHBOARD_TABS.LIST ? 'bg-foreground/10 text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                        >
                            <ListIcon
                                className='h-3.5 w-3.5'
                                weight={
                                    demoPreviewTab === DASHBOARD_TABS.LIST
                                        ? 'fill'
                                        : 'regular'
                                }
                            />
                            <span className='hidden sm:inline'>
                                {t('dashboard.listTab')}
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
                                    initialNodes={demoPlaygroundData.nodes}
                                    initialEdges={demoPlaygroundData.edges}
                                    initialZoom={1.25}
                                    allowPageScroll
                                    onNodeClick={(clawId) => {
                                        setDemoClawId(
                                            demoClawId === clawId
                                                ? null
                                                : clawId
                                        )
                                    }}
                                    onPaneClick={() => {
                                        setDemoClawId(null)
                                    }}
                                    panelOpen={!!demoClaw}
                                    selectedClawId={demoClawId}
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
                        </AnimatePresence>
                    </div>
                ) : (
                    <div className='relative flex min-w-0 flex-1 overflow-hidden'>
                        <div className='playground-grid pointer-events-none absolute inset-0 opacity-50' />
                        <ChatSidebar
                            claws={demoPlaygroundData.claws}
                            selectedClawId={demoChatSettingsClawId}
                            readOnly
                            onOpenClawSettings={(clawId) => {
                                setDemoChatSettingsClawId(
                                    demoChatSettingsClawId === clawId
                                        ? null
                                        : clawId
                                )
                            }}
                        />
                        <div className='relative flex min-h-0 min-w-0 flex-1 translate-x-0 overflow-hidden'>
                            <div className='min-w-0 flex-1'>
                                {demoChatSettingsClaw ? (
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
                                ) : (
                                    <ChatEmptyState />
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </Fragment>
    )
}

export default LandingDemoPreview