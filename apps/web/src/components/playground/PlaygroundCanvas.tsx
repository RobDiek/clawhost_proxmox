import type { FC, ReactNode } from 'react'
import type { PlaygroundCanvasProps } from '@/ts/Interfaces'

import { useState } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import PlaygroundCanvasInner from '@/components/playground/PlaygroundCanvasInner'

const PlaygroundCanvas: FC<PlaygroundCanvasProps> = ({
    initialNodes,
    initialEdges,
    onNodeClick,
    onPaneClick,
    panelOpen,
    selectedClawId,
    initialZoom,
    allowPageScroll
}): ReactNode => {
    const [zoom, setZoom] = useState(initialZoom ?? 0.8)
    const [isFitView, setIsFitView] = useState(true)

    return (
        <ReactFlowProvider>
            <PlaygroundCanvasInner
                initialNodes={initialNodes}
                initialEdges={initialEdges}
                onNodeClick={onNodeClick}
                onPaneClick={onPaneClick}
                panelOpen={panelOpen}
                selectedClawId={selectedClawId}
                initialZoom={initialZoom}
                allowPageScroll={allowPageScroll}
                zoom={zoom}
                onZoomChange={setZoom}
                isFitView={isFitView}
                onFitViewChange={setIsFitView}
            />
        </ReactFlowProvider>
    )
}

export default PlaygroundCanvas