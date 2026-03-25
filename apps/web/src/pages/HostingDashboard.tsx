import type { FC, ReactNode } from 'react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useInstances, useRestartInstance, useDeleteInstance } from '@/hooks/useInstances'
import InstanceCard from '@/components/hosting/InstanceCard'
import Configurator from '@/components/hosting/Configurator'

const HostingDashboard: FC = (): ReactNode => {
    const navigate = useNavigate()
    const { data: instances, isLoading } = useInstances()
    const restartMutation = useRestartInstance()
    const deleteMutation = useDeleteInstance()
    const checkoutMutation = useCheckout()
    const [showConfigurator, setShowConfigurator] = useState(false)

    const handleDeploy = async (config: {
        components: string[]
        automationTool: 'n8n' | 'activepieces'
        addons: string[]
    }) => {
        // In production: collect user details first, then checkout
        // For now, redirect to a checkout flow
        setShowConfigurator(false)
        navigate('/checkout', { state: config })
    }

    const activeInstances = instances?.filter(i => i.status !== 'terminated') || []

    return (
        <div className="min-h-screen bg-background" dir="rtl">
            <div className="max-w-5xl mx-auto px-6 py-10">
                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h1 className="text-2xl font-bold">הסוכנים שלי</h1>
                        <p className="text-sm text-muted-foreground mt-1">
                            {activeInstances.length > 0
                                ? `${activeInstances.length} סוכנים פעילים`
                                : 'אין סוכנים עדיין'
                            }
                        </p>
                    </div>
                    <button
                        onClick={() => setShowConfigurator(!showConfigurator)}
                        className="py-2.5 px-5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 transition-opacity"
                    >
                        + הפעילו סוכן חדש
                    </button>
                </div>

                {/* Configurator Modal */}
                {showConfigurator && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                        <div className="bg-background rounded-2xl border border-border shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto p-8 mx-4">
                            <div className="flex items-center justify-between mb-6">
                                <h2 className="text-xl font-bold">הפעלת סוכן חדש</h2>
                                <button
                                    onClick={() => setShowConfigurator(false)}
                                    className="w-8 h-8 rounded-lg hover:bg-accent flex items-center justify-center text-muted-foreground"
                                >
                                    ✕
                                </button>
                            </div>
                            <Configurator onDeploy={handleDeploy} />
                        </div>
                    </div>
                )}

                {/* Loading */}
                {isLoading && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {[1, 2].map(i => (
                            <div key={i} className="p-5 rounded-2xl border border-border animate-pulse">
                                <div className="h-4 bg-muted rounded w-1/3 mb-3" />
                                <div className="h-3 bg-muted rounded w-2/3 mb-2" />
                                <div className="h-3 bg-muted rounded w-1/2" />
                            </div>
                        ))}
                    </div>
                )}

                {/* Empty State */}
                {!isLoading && activeInstances.length === 0 && !showConfigurator && (
                    <div className="text-center py-20">
                        <div className="text-6xl mb-4">🤖</div>
                        <h3 className="text-xl font-semibold mb-2">אין סוכנים עדיין</h3>
                        <p className="text-muted-foreground mb-6">צרו את הסוכן הראשון שלכם — תוך 3 דקות הכל עובד.</p>
                        <button
                            onClick={() => setShowConfigurator(true)}
                            className="py-3 px-8 rounded-xl bg-primary text-primary-foreground font-semibold hover:opacity-90"
                        >
                            הפעילו סוכן חדש
                        </button>
                    </div>
                )}

                {/* Instance Cards */}
                {!isLoading && activeInstances.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {activeInstances.map(instance => (
                            <InstanceCard
                                key={instance.id}
                                instance={instance}
                                onRestart={(id) => restartMutation.mutate(id)}
                                onDelete={(id) => {
                                    if (confirm('בטוחים שרוצים למחוק את הסוכן?')) {
                                        deleteMutation.mutate(id)
                                    }
                                }}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}

export default HostingDashboard
