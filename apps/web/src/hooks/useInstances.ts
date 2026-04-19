import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { RequestClient } from '@openclaw/shared'

const getAuthHeaders = async (): Promise<Record<string, string>> => {
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

// ── LiteLLM AI Gateway ──

export function useLitellmStatus(instanceId: string) {
    return useQuery({
        queryKey: ['litellm-status', instanceId],
        queryFn: () => client.get<{ data: { running: boolean; models: string[] } }>(`/hosting/instances/${instanceId}/litellm/status`).then(r => r.data),
        refetchInterval: 30_000,
        enabled: !!instanceId
    })
}

export function useSetLitellmApiKey() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ instanceId, provider, apiKey }: { instanceId: string; provider: 'anthropic' | 'openai'; apiKey: string }) =>
            client.post(`/hosting/instances/${instanceId}/litellm/api-key`, { provider, apiKey }),
        onSuccess: (_, vars) => {
            qc.invalidateQueries({ queryKey: ['litellm-status', vars.instanceId] })
        }
    })
}

export function useLitellmUsage(instanceId: string) {
    return useQuery({
        queryKey: ['litellm-usage', instanceId],
        queryFn: () => client.get<{ data: unknown[] }>(`/hosting/instances/${instanceId}/litellm/usage`).then(r => r.data),
        enabled: !!instanceId
    })
}

// ── Langfuse Observability ──

export function useLangfuseStatus(instanceId: string) {
    return useQuery({
        queryKey: ['langfuse-status', instanceId],
        queryFn: () => client.get<{ data: { running: boolean; url: string; publicKey: string; loginEmail: string } }>(`/hosting/instances/${instanceId}/langfuse/status`).then(r => r.data),
        refetchInterval: 60_000,
        enabled: !!instanceId
    })
}

// ── Knowledge Base (RAG) ──

export function useKnowledgeDocs(instanceId: string) {
    return useQuery({
        queryKey: ['knowledge-docs', instanceId],
        queryFn: () => client.get<{ data: Array<{ id: string; filename: string; contentType: string; chunkCount: number; status: string; createdAt: string }> }>(`/hosting/instances/${instanceId}/knowledge/documents`).then(r => r.data),
        enabled: !!instanceId
    })
}

export function useUploadKnowledgeDoc() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ instanceId, filename, content, contentType }: { instanceId: string; filename: string; content: string; contentType?: string }) =>
            client.post(`/hosting/instances/${instanceId}/knowledge/upload`, { filename, content, contentType }),
        onSuccess: (_, vars) => {
            qc.invalidateQueries({ queryKey: ['knowledge-docs', vars.instanceId] })
        }
    })
}

export function useSearchKnowledge() {
    return useMutation({
        mutationFn: ({ instanceId, query, limit }: { instanceId: string; query: string; limit?: number }) =>
            client.post<{ data: Array<{ content: string; score: number; filename: string }> }>(`/hosting/instances/${instanceId}/knowledge/search`, { query, limit })
    })
}

// ── LLM Guard ──

export function useGuardStatus(instanceId: string) {
    return useQuery({
        queryKey: ['guard-status', instanceId],
        queryFn: () => client.get<{ data: { installed: boolean; enabled: boolean } }>(`/hosting/instances/${instanceId}/guard/status`).then(r => r.data),
        enabled: !!instanceId
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