import type { Node, Edge } from '@xyflow/react'
import type { Claw, DemoPlaygroundData } from '@/ts/Interfaces'

import dagre from 'dagre'

const CLAW_NODE_WIDTH = 280
const CLAW_NODE_HEIGHT = 140

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

    demoClaws.forEach((claw) => {
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
                readOnly: true
            } as Record<string, unknown>,
            draggable: false
        })
    })

    dagre.layout(g)

    nodes.forEach((node) => {
        const dagreNode = g.node(node.id)
        if (dagreNode) {
            node.position = {
                x: dagreNode.x - CLAW_NODE_WIDTH / 2,
                y: dagreNode.y - CLAW_NODE_HEIGHT / 2
            }
        }
    })

    return { nodes, edges, claws: demoClaws }
}

const demoPlaygroundData: DemoPlaygroundData = buildDemoGraph()

export default demoPlaygroundData