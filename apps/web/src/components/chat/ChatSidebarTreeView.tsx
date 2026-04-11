import type { FC, ReactNode } from 'react'
import type { ChatSidebarTreeViewProps } from '@/ts/Interfaces'

import { Fragment, useMemo } from 'react'
import { getStatusConfig } from '@/lib/claw-utils'
import ChatSidebarClawHeader from '@/components/chat/ChatSidebarClawHeader'

const ChatSidebarTreeView: FC<ChatSidebarTreeViewProps> = ({
    claws,
    selectedClawId,
    readOnly,
    onOpenClawSettings
}): ReactNode => {
    const statusConfigs = useMemo(() => getStatusConfig(), [])

    return (
        <Fragment>
            {claws.map((claw) => {
                const status =
                    statusConfigs[claw.status] || statusConfigs.unknown

                return (
                    <div key={claw.id} className='mb-3 last:mb-0'>
                        <ChatSidebarClawHeader
                            claw={claw}
                            isSelected={selectedClawId === claw.id}
                            statusConfig={status}
                            readOnly={readOnly}
                            onOpenClawSettings={onOpenClawSettings}
                        />
                    </div>
                )
            })}
        </Fragment>
    )
}

export default ChatSidebarTreeView