import type { ElectronWindow } from '@/ts/Interfaces'

import { useState, useEffect } from 'react'

const useAppVersion = (isLocal: boolean): string => {
    const [appVersion, setAppVersion] = useState('')

    useEffect(() => {
        if (!isLocal) return
        const api = (window as unknown as ElectronWindow).electronAPI
        if (api?.getAppVersion) {
            api.getAppVersion().then((v) => setAppVersion(`v${v}`))
        }
    }, [isLocal])

    return appVersion
}

export default useAppVersion