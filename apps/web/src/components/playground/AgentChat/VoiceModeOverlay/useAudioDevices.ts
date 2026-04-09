import type { UseAudioDevicesReturn } from '@/ts/Interfaces'

import { useState, useEffect, useCallback } from 'react'

const useAudioDevices = (): UseAudioDevicesReturn => {
    const [inputDevices, setInputDevices] = useState<MediaDeviceInfo[]>([])
    const [outputDevices, setOutputDevices] = useState<MediaDeviceInfo[]>([])
    const [selectedInputId, setSelectedInputId] = useState('')
    const [selectedOutputId, setSelectedOutputId] = useState('')

    const refreshDevices = useCallback(async () => {
        try {
            await navigator.mediaDevices
                .getUserMedia({ audio: true })
                .then((stream) => {
                    stream.getTracks().forEach((track) => track.stop())
                })
        } catch (error) {
            console.error('useAudioDevices', error)
        }

        try {
            const devices = await navigator.mediaDevices.enumerateDevices()
            const inputs = devices.filter((d) => d.kind === 'audioinput')
            const outputs = devices.filter((d) => d.kind === 'audiooutput')
            setInputDevices(inputs)
            setOutputDevices(outputs)

            setSelectedInputId((prev) => {
                if (prev && inputs.find((d) => d.deviceId === prev)) return prev
                return inputs[0]?.deviceId || ''
            })
            setSelectedOutputId((prev) => {
                if (prev && outputs.find((d) => d.deviceId === prev))
                    return prev
                return outputs[0]?.deviceId || ''
            })
        } catch (error) {
            console.error('useAudioDevices', error)
        }
    }, [])

    useEffect(() => {
        refreshDevices()
    }, [refreshDevices])

    useEffect(() => {
        const handler = () => refreshDevices()
        navigator.mediaDevices.addEventListener('devicechange', handler)
        return () =>
            navigator.mediaDevices.removeEventListener('devicechange', handler)
    }, [refreshDevices])

    return {
        inputDevices,
        outputDevices,
        selectedInputId,
        selectedOutputId,
        setSelectedInputId,
        setSelectedOutputId,
        hasNoInput: inputDevices.length === 0,
        hasNoOutput: outputDevices.length === 0
    }
}

export default useAudioDevices