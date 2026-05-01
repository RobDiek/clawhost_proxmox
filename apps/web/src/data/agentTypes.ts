import type { AgentTypeOption } from '@/ts/Interfaces'

import { agentType, externalUrls } from '@openclaw/shared'
import { OpenClawIcon, HermesIcon } from '@/components/icons'

const agentTypes: AgentTypeOption[] = [
    {
        type: agentType.OPENCLAW,
        Icon: OpenClawIcon,
        nameKey: 'createClaw.agentTypeOpenClaw',
        descriptionKey: 'createClaw.agentTypeOpenClawDescription',
        docsUrl: externalUrls.AGENT_DOCS.OPENCLAW
    },
    {
        type: agentType.HERMES,
        Icon: HermesIcon,
        nameKey: 'createClaw.agentTypeHermes',
        descriptionKey: 'createClaw.agentTypeHermesDescription',
        docsUrl: externalUrls.AGENT_DOCS.HERMES
    }
]

export default agentTypes