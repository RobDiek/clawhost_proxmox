import { useState, useEffect, useCallback } from 'react'
import { api } from '@/lib'

const useAgentCredentials = (agentId: string) => {
    const [password, setPassword] = useState('')
    const [gatewayToken, setGatewayToken] = useState('')
    const [originalPassword, setOriginalPassword] = useState('')
    const [originalToken, setOriginalToken] = useState('')
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const fetch = async () => {
            try {
                const res = await api.getAgentCredentials(agentId)
                setPassword(res.rootPassword || '')
                setOriginalPassword(res.rootPassword || '')
                setGatewayToken(res.gatewayToken || '')
                setOriginalToken(res.gatewayToken || '')
            } catch {
                setPassword('')
                setGatewayToken('')
            } finally {
                setLoading(false)
            }
        }
        fetch()
    }, [agentId])

    const passwordChanged = password !== originalPassword && password.length > 0
    const tokenChanged = gatewayToken !== originalToken && gatewayToken.length > 0

    const confirmPasswordSaved = useCallback(() => {
        setOriginalPassword(password)
    }, [password])

    const confirmTokenSaved = useCallback(() => {
        setOriginalToken(gatewayToken)
    }, [gatewayToken])

    return {
        password,
        setPassword,
        gatewayToken,
        setGatewayToken,
        loading,
        passwordChanged,
        tokenChanged,
        confirmPasswordSaved,
        confirmTokenSaved
    }
}

export default useAgentCredentials