import type { DetectedMacArch } from '@/ts/Types'

import { useEffect, useState } from 'react'
import MAC_ARCH from '@/lib/constants/macArch'

const UNKNOWN: DetectedMacArch = 'unknown'

interface UADataLike {
    getHighEntropyValues?: (
        keys: string[]
    ) => Promise<{ architecture?: string }>
}

const fromUserAgentData = async (): Promise<DetectedMacArch> => {
    const uaData = (navigator as unknown as { userAgentData?: UADataLike })
        .userAgentData
    if (!uaData?.getHighEntropyValues) return UNKNOWN
    try {
        const data = await uaData.getHighEntropyValues(['architecture'])
        if (data.architecture === 'arm') return MAC_ARCH.ARM64
        if (data.architecture === 'x86') return MAC_ARCH.X64
    } catch (error) {
        console.error('fromUserAgentData', error)
    }
    return UNKNOWN
}

const fromWebGL = (): DetectedMacArch => {
    try {
        const canvas = document.createElement('canvas')
        const gl = canvas.getContext('webgl') as WebGLRenderingContext | null
        if (!gl) return UNKNOWN
        const ext = gl.getExtension('WEBGL_debug_renderer_info')
        if (!ext) return UNKNOWN
        const renderer = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL))
        if (/Apple\s+(M\d|GPU)/i.test(renderer)) return MAC_ARCH.ARM64
        if (/Intel|AMD|Radeon/i.test(renderer)) return MAC_ARCH.X64
    } catch (error) {
        console.error('fromWebGL', error)
    }
    return UNKNOWN
}

const useMacArch = (enabled: boolean): DetectedMacArch => {
    const [arch, setArch] = useState<DetectedMacArch>(UNKNOWN)

    useEffect(() => {
        if (!enabled) return
        let cancelled = false
        fromUserAgentData().then((result) => {
            if (cancelled) return
            if (result !== UNKNOWN) {
                setArch(result)
                return
            }
            const fallback = fromWebGL()
            if (!cancelled) setArch(fallback)
        })
        return () => {
            cancelled = true
        }
    }, [enabled])

    return arch
}

export default useMacArch