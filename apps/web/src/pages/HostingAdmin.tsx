import type { FC, ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { HostingInstance } from '@/hooks/useInstances'

const STATUS_COLORS: Record<string, string> = {
    running: 'bg-green-500',
    provisioning: 'bg-yellow-500',
    initializing: 'bg-yellow-500',
    suspended: 'bg-red-500',
    failed: 'bg-red-500',
    terminated: 'bg-gray-400',
    awaiting_payment: 'bg-yellow-500',
}

const HostingAdmin: FC = (): ReactNode => {
    // Admin uses same endpoint but sees all instances via admin middleware
    const { data: instances, isLoading } = useQuery({
        queryKey: ['admin-hosting-instances'],
        queryFn: async () => {
            const { getAuth } = await import('firebase/auth')
            const auth = getAuth()
            const token = await auth.currentUser?.getIdToken()
            const res = await fetch('/api/hosting/instances', {
                headers: { Authorization: `Bearer ${token}` }
            })
            const data = await res.json()
            return data.data as HostingInstance[]
        },
        refetchInterval: 30_000
    })

    const totalMRR = instances?.reduce((sum, i) => {
        if (i.status === 'running' || i.status === 'initializing') {
            return sum + parseFloat(i.priceIls || '0')
        }
        return sum
    }, 0) || 0

    const activeCount = instances?.filter(i => i.status === 'running').length || 0
    const totalCount = instances?.length || 0

    return (
        <div className="min-h-screen bg-background" dir="rtl">
            <div className="max-w-6xl mx-auto px-6 py-10">
                <h1 className="text-2xl font-bold mb-8">🔧 Admin Panel</h1>

                {/* Stats */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
                    <div className="p-4 rounded-xl border border-border bg-card">
                        <div className="text-sm text-muted-foreground">MRR</div>
                        <div className="text-2xl font-bold text-primary">₪{totalMRR.toFixed(0)}</div>
                    </div>
                    <div className="p-4 rounded-xl border border-border bg-card">
                        <div className="text-sm text-muted-foreground">סוכנים פעילים</div>
                        <div className="text-2xl font-bold">{activeCount}</div>
                    </div>
                    <div className="p-4 rounded-xl border border-border bg-card">
                        <div className="text-sm text-muted-foreground">סה״כ</div>
                        <div className="text-2xl font-bold">{totalCount}</div>
                    </div>
                    <div className="p-4 rounded-xl border border-border bg-card">
                        <div className="text-sm text-muted-foreground">עלות Hetzner (est.)</div>
                        <div className="text-2xl font-bold text-muted-foreground">~₪{(activeCount * 40).toFixed(0)}</div>
                    </div>
                </div>

                {/* Instances Table */}
                {isLoading ? (
                    <div className="text-center py-10 text-muted-foreground">טוען...</div>
                ) : (
                    <div className="border border-border rounded-xl overflow-hidden">
                        <table className="w-full text-sm">
                            <thead className="bg-muted">
                                <tr>
                                    <th className="text-right p-3 font-medium">ID</th>
                                    <th className="text-right p-3 font-medium">תוכנית</th>
                                    <th className="text-right p-3 font-medium">סטטוס</th>
                                    <th className="text-right p-3 font-medium">מחיר</th>
                                    <th className="text-right p-3 font-medium">IP</th>
                                    <th className="text-right p-3 font-medium">נוצר</th>
                                </tr>
                            </thead>
                            <tbody>
                                {instances?.map(instance => (
                                    <tr key={instance.id} className="border-t border-border hover:bg-accent/50">
                                        <td className="p-3 font-mono text-xs">{instance.id}</td>
                                        <td className="p-3">{instance.planKey}</td>
                                        <td className="p-3">
                                            <span className="flex items-center gap-2">
                                                <span className={`w-2 h-2 rounded-full ${STATUS_COLORS[instance.status] || 'bg-gray-400'}`} />
                                                {instance.status}
                                            </span>
                                        </td>
                                        <td className="p-3">₪{instance.priceIls}</td>
                                        <td className="p-3 font-mono text-xs">{instance.subdomainAgent || '—'}</td>
                                        <td className="p-3 text-muted-foreground">
                                            {new Date(instance.createdAt).toLocaleDateString('he-IL')}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    )
}

export default HostingAdmin