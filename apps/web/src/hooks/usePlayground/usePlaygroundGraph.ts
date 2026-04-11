import type { Node, Edge } from '@xyflow/react'
import type { Claw } from '@/ts/Interfaces'

import { useMemo } from 'react'
import dagre from 'dagre'

const CLAW_NODE_WIDTH = 280
const CLAW_NODE_HEIGHT = 140

const usePlaygroundGraph = (claws: Claw[]) => {
    return useMemo(() => {
        const nodes: Node[] = []
        const edges: Edge[] = []

        const g = new dagre.graphlib.Graph()
        g.setDefaultEdgeLabel(() => ({}))
        g.setGraph({
            rankdir: 'TB',
            nodesep: 80,
            ranksep: 20,
            marginx: 40,
            marginy: 40
        })

        claws.forEach((claw) => {
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
                    isSelected: false
                } as Record<string, unknown>,
                draggable: false
            })
        })

        dagre.layout(g)

        nodes.forEach((node) => {
            const dagreNode = g.node(node.id)
            if (dagreNode) {
                node.position = {
                    x: dagreNode.x - dagreNode.width / 2,
                    y: dagreNode.y - dagreNode.height / 2
                }
            }
        })

        return { nodes, edges }
    }, [claws])
}

export default usePlaygroundGraph