import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { RequestClient } from '@openclaw/shared'

const getAuthHeaders = async () => {
    const { getAuth } = await import('firebase/auth')
    const auth = getAuth()
    const user = auth.currentUser
    if (!user) return {}
    const token = await user.getIdToken()
    return { Authorization: `Bearer ${token}` }
}

const client = new RequestClient({
    baseUrl: import.meta.env.VITE_API_URL || '/api',
    getHeaders: getAuthHeaders
})

export interface HostingInstance {
    id: string
    planKey: string
    priceIls: string
    status: string
    selectedComponents: string[]
    automationTool: string
    subdomainAgent: string
    subdomainFlows: string
    onboardingStep: number
    onboardingCompleted: boolean
    subscriptionStatus: string
    createdAt: string
}

export function useInstances() {
    return useQuery({
        queryKey: ['hosting-instances'],
        queryFn: () => client.get<{ data: HostingInstance[] }>('/hosting/instances').then(r => r.data),
        refetchInterval: 30_000
    })
}

export function useInstance(instanceId: string) {
    return useQuery({
        queryKey: ['hosting-instance', instanceId],
        queryFn: () => client.get<{ data: HostingInstance }>(`/hosting/instances/${instanceId}`).then(r => r.data),
        refetchInterval: 10_000,
        enabled: !!instanceId
    })
}

export function useInstanceStatus(instanceId: string) {
    return useQuery({
        queryKey: ['hosting-instance-status', instanceId],
        queryFn: () => client.get<{ data: { status: string; serverStatus: string; ip: string; subdomainAgent: string; subdomainFlows: string; onboardingStep: number } }>(`/hosting/instances/${instanceId}/status`).then(r => r.data),
        refetchInterval: 10_000,
        enabled: !!instanceId
    })
}

export function useRestartInstance() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (instanceId: string) => client.post(`/hosting/instances/${instanceId}/restart`),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['hosting-instances'] })
    })
}

export function useDeleteInstance() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (instanceId: string) => client.delete(`/hosting/instances/${instanceId}`),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['hosting-instances'] })
    })
}

export function useCheckout() {
    return useMutation({
        mutationFn: (params: {
            components: string[]
            automationTool: string
            addons: string[]
            customerEmail: string
            customerName: string
            customerPhone: string
        }) => client.post<{ data: { paymentUrl: string; instanceId: string } }>('/hosting/checkout', params)
    })
}
