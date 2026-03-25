import type { FC, ReactNode } from 'react'
import type { HostingInstance } from '@/hooks/useInstances'
import { PLANS, COMPONENTS } from '@openclaw/shared'

interface InstanceCardProps {
    instance: HostingInstance
    onRestart: (id: string) => void
    onDelete: (id: string) => void
}

const STATUS_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
    running: { label: 'פעיל', color: 'text-green-600', dot: 'bg-green-500' },
    provisioning: { label: 'מוגדר...', color: 'text-yellow-600', dot: 'bg-yellow-500 animate-pulse' },
    initializing: { label: 'מאתחל...', color: 'text-yellow-600', dot: 'bg-yellow-500 animate-pulse' },
    suspended: { label: 'מושהה', color: 'text-red-600', dot: 'bg-red-500' },
    failed: { label: 'נכשל', color: 'text-red-600', dot: 'bg-red-500' },
    terminated: { label: 'הופסק', color: 'text-muted-foreground', dot: 'bg-muted-foreground' },
    awaiting_payment: { label: 'ממתין לתשלום', color: 'text-yellow-600', dot: 'bg-yellow-500' },
}

const InstanceCard: FC<InstanceCardProps> = ({ instance, onRestart, onDelete }): ReactNode => {
    const plan = PLANS.find(p => p.key === instance.planKey)
    const statusConfig = STATUS_CONFIG[instance.status] || STATUS_CONFIG.failed
    const components = (instance.selectedComponents || []).map(id =>
        COMPONENTS.find(c => c.id === id)
    ).filter(Boolean)

    return (
        <div className="p-5 rounded-2xl border border-border bg-card hover:shadow-sm transition-shadow" dir="rtl">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                    <div className={`w-2.5 h-2.5 rounded-full ${statusConfig.dot}`} />
                    <div>
                        <div className="font-semibold text-sm">{plan?.nameHe || instance.planKey}</div>
                        <div className={`text-xs ${statusConfig.color}`}>{statusConfig.label}</div>
                    </div>
                </div>
                <div className="text-left">
                    <div className="font-bold text-lg">₪{instance.priceIls}</div>
                    <div className="text-xs text-muted-foreground">לחודש</div>
                </div>
            </div>

            {/* Components */}
            <div className="flex flex-wrap gap-1.5 mb-4">
                {components.map(comp => comp && (
                    <span key={comp.id} className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                        {comp.nameHe}
                    </span>
                ))}
                {instance.automationTool && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                        {instance.automationTool}
                    </span>
                )}
            </div>

            {/* URLs */}
            {instance.status === 'running' && instance.subdomainAgent && (
                <div className="space-y-1.5 mb-4 text-xs" dir="ltr">
                    <a
                        href={`https://${instance.subdomainAgent}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-primary hover:underline"
                    >
                        🤖 {instance.subdomainAgent} ↗
                    </a>
                    {instance.subdomainFlows && (
                        <a
                            href={`https://${instance.subdomainFlows}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 text-muted-foreground hover:text-primary hover:underline"
                        >
                            ⚡ {instance.subdomainFlows} ↗
                        </a>
                    )}
                </div>
            )}

            {/* Onboarding progress */}
            {!instance.onboardingCompleted && instance.status === 'running' && (
                <div className="mb-4">
                    <a
                        href={`/onboarding/${instance.id}`}
                        className="text-xs text-primary hover:underline"
                    >
                        המשיכו את ההגדרה (שלב {instance.onboardingStep}/3) ←
                    </a>
                </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 pt-3 border-t border-border">
                {instance.status === 'running' && (
                    <button
                        onClick={() => onRestart(instance.id)}
                        className="flex-1 text-xs py-2 px-3 rounded-lg border border-border hover:bg-accent transition-colors"
                    >
                        ⟳ הפעל מחדש
                    </button>
                )}
                {instance.subdomainAgent && instance.status === 'running' && (
                    <a
                        href={`https://${instance.subdomainAgent}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 text-xs py-2 px-3 rounded-lg bg-primary text-primary-foreground text-center hover:opacity-90 transition-opacity"
                    >
                        פתח OpenClaw ↗
                    </a>
                )}
                {(instance.status === 'terminated' || instance.status === 'failed') && (
                    <button
                        onClick={() => onDelete(instance.id)}
                        className="flex-1 text-xs py-2 px-3 rounded-lg border border-destructive/30 text-destructive hover:bg-destructive/10 transition-colors"
                    >
                        מחיקה
                    </button>
                )}
            </div>
        </div>
    )
}

export default InstanceCard
