import type { DeviceInfo, ElectronWindow } from '@/ts/Interfaces'

import { useEffect, useState } from 'react'

const useDeviceInfo = (enabled: boolean): DeviceInfo | null => {
    const [info, setInfo] = useState<DeviceInfo | null>(null)

    useEffect(() => {
        if (!enabled) return
        const api = (window as unknown as ElectronWindow).electronAPI
        if (!api?.getDeviceInfo) return
        api.getDeviceInfo().then(setInfo)
    }, [enabled])

    return info
}

export default useDeviceInfo