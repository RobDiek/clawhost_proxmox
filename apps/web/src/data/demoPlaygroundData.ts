import type { Node, Edge } from '@xyflow/react'
import type { Claw, ClawAgent, DemoPlaygroundData } from '@/ts/Interfaces'

import dagre from 'dagre'

const CLAW_NODE_WIDTH = 280
const CLAW_NODE_HEIGHT = 140
const AGENT_NODE_WIDTH = 240
const AGENT_NODE_HEIGHT = 100

const demoClaws: Claw[] = [
    {
        id: 'demo-1',
        name: 'personal-claw',
        status: 'running',
        ip: '45.33.21.98',
        planId: 'cx22',
        location: 'Frankfurt, DE',
        rootPassword: null,
        hasRootPassword: false,
        sshKeyId: null,
        providerServerId: '48291053',
        subdomain: 'personal-claw',
        gatewayToken: null,
        subscriptionStatus: 'active',
        billingInterval: null,
        currentPeriodStart: null,
        currentPeriodEnd: null,
        deletionScheduledAt: null,
        createdAt: '2026-01-15T00:00:00Z'
    }
]

const demoAgents: ClawAgent[][] = [
    [
        {
            id: 'agent-1a',
            name: 'code-assistant',
            model: 'claude-sonnet-4-5-20250929',
            status: 'running',
            directory: null
        },
        {
            id: 'agent-1b',
            name: 'test-runner',
            model: 'gpt-4o',
            status: 'running',
            directory: null
        }
    ]
]

const buildDemoGraph = (): DemoPlaygroundData => {
    const nodes: Node[] = []
    const edges: Edge[] = []

    const g = new dagre.graphlib.Graph()
    g.setDefaultEdgeLabel(() => ({}))
    g.setGraph({
        rankdir: 'TB',
        nodesep: 100,
        ranksep: 30,
        marginx: 40,
        marginy: 40
    })

    demoClaws.forEach((claw, index) => {
        const agents = demoAgents[index] || []
        const clawNodeId = `claw-${claw.id}`

        g.setNode(clawNodeId, {
            width: CLAW_NODE_WIDTH,
            height: CLAW_NODE_HEIGHT
        })

        nodes.push({
            id: clawNodeId,
            type: 'clawNode',
            position: { x: 0, y: 0 },
            data: {
                claw,
                agentCount: agents.length,
                isLoadingAgents: false,
                readOnly: true
            } as Record<string, unknown>,
            draggable: false
        })

        agents.forEach((agent) => {
            const agentNodeId = `agent-${claw.id}-${agent.id}`

            g.setNode(agentNodeId, {
                width: AGENT_NODE_WIDTH,
                height: AGENT_NODE_HEIGHT
            })

            nodes.push({
                id: agentNodeId,
                type: 'agentNode',
                position: { x: 0, y: 0 },
                data: {
                    agent,
                    clawName: claw.name,
                    clawId: claw.id,
                    isSelected: false,
                    subdomain: null,
                    gatewayToken: null
                } as Record<string, unknown>,
                draggable: false
            })

            g.setEdge(clawNodeId, agentNodeId)

            edges.push({
                id: `edge-${clawNodeId}-${agentNodeId}`,
                source: clawNodeId,
                target: agentNodeId,
                type: 'straight',
                style: {
                    stroke: 'hsl(var(--muted-foreground) / 0.3)',
                    strokeWidth: 1.5
                }
            })
        })
    })

    dagre.layout(g)

    nodes.forEach((node) => {
        const dagreNode = g.node(node.id)
        if (dagreNode) {
            const width =
                node.type === 'clawNode' ? CLAW_NODE_WIDTH : AGENT_NODE_WIDTH
            const height =
                node.type === 'clawNode' ? CLAW_NODE_HEIGHT : AGENT_NODE_HEIGHT
            node.position = {
                x: dagreNode.x - width / 2,
                y: dagreNode.y - height / 2
            }
        }
    })

    const agentsByClawId: Record<string, ClawAgent[]> = {}
    demoClaws.forEach((claw, index) => {
        agentsByClawId[claw.id] = demoAgents[index] || []
    })

    return { nodes, edges, claws: demoClaws, agentsByClawId }
}

const demoPlaygroundData: DemoPlaygroundData = buildDemoGraph()

export default demoPlaygroundData