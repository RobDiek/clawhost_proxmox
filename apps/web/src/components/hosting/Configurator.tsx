import { useState, useMemo } from 'react'
import { COMPONENTS, ADDONS, calcTotal } from '@openclaw/shared'
import type { ComponentInfo } from '@openclaw/shared'

interface ConfiguratorProps {
    onDeploy: (config: {
        components: string[]
        automationTool: 'n8n' | 'activepieces'
        addons: string[]
    }) => void
}

const CATEGORY_LABELS: Record<string, { he: string; icon: string }> = {
    agent: { he: 'סוכנים', icon: '🤖' },
    automation: { he: 'אוטומציות', icon: '⚡' },
    ai: { he: 'מודל AI', icon: '🧠' },
}

const Configurator: React.FC<ConfiguratorProps> = ({ onDeploy }) => {
    const [selected, setSelected] = useState<string[]>(['oc'])
    const [automationTool, setAutomationTool] = useState<'n8n' | 'activepieces'>('activepieces')
    const [selectedAddons, setSelectedAddons] = useState<string[]>([])

    const toggleComponent = (id: string) => {
        setSelected(prev =>
            prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
        )
    }

    const toggleAddon = (id: string) => {
        setSelectedAddons(prev =>
            prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id]
        )
    }

    const pricing = useMemo(() => calcTotal(selected, selectedAddons), [selected, selectedAddons])

    const hasAutomation = selected.includes('n8') || selected.includes('ap')

    const groupedComponents = useMemo(() => {
        const groups: Record<string, ComponentInfo[]> = {}
        for (const comp of COMPONENTS) {
            if (!groups[comp.category]) groups[comp.category] = []
            groups[comp.category].push(comp)
        }
        return groups
    }, [])

    return (
        <div className="w-full max-w-3xl mx-auto" dir="rtl">
            {/* Components Selection */}
            <div className="space-y-6">
                {Object.entries(groupedComponents).map(([category, comps]) => (
                    <div key={category}>
                        <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
                            <span>{CATEGORY_LABELS[category]?.icon}</span>
                            {CATEGORY_LABELS[category]?.he}
                        </h3>
                        <div className="space-y-2">
                            {comps.map(comp => (
                                <button
                                    key={comp.id}
                                    onClick={() => comp.available && toggleComponent(comp.id)}
                                    disabled={!comp.available}
                                    className={`w-full flex items-center justify-between p-4 rounded-xl border transition-all text-right ${
                                        selected.includes(comp.id)
                                            ? 'border-primary bg-primary/5 shadow-sm'
                                            : comp.available
                                                ? 'border-border hover:border-primary/50 hover:bg-accent/50'
                                                : 'border-border opacity-50 cursor-not-allowed'
                                    }`}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors ${
                                            selected.includes(comp.id)
                                                ? 'border-primary bg-primary'
                                                : 'border-muted-foreground/30'
                                        }`}>
                                            {selected.includes(comp.id) && (
                                                <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
                                                    <path d="M2 6l3 3 5-5" />
                                                </svg>
                                            )}
                                        </div>
                                        <div>
                                            <div className="font-medium text-sm">{comp.nameHe}</div>
                                            <div className="text-xs text-muted-foreground">{comp.ram}GB RAM</div>
                                        </div>
                                    </div>
                                    {!comp.available && (
                                        <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">בקרוב</span>
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            {/* Automation Tool */}
            {hasAutomation && (
                <div className="mt-6">
                    <h3 className="text-sm font-semibold text-muted-foreground mb-3">⚙️ כלי אוטומציה</h3>
                    <div className="grid grid-cols-2 gap-2">
                        {(['activepieces', 'n8n'] as const).map(tool => (
                            <button
                                key={tool}
                                onClick={() => setAutomationTool(tool)}
                                className={`p-3 rounded-xl border text-center transition-all ${
                                    automationTool === tool
                                        ? 'border-primary bg-primary/5'
                                        : 'border-border hover:border-primary/50'
                                }`}
                            >
                                <div className="font-medium text-sm">{tool === 'n8n' ? 'n8n' : 'Activepieces'}</div>
                                <div className="text-xs text-muted-foreground">{tool === 'n8n' ? 'מתקדם' : 'פשוט יותר'}</div>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Add-ons */}
            <div className="mt-6">
                <h3 className="text-sm font-semibold text-muted-foreground mb-3">🧩 תוספות</h3>
                <div className="space-y-2">
                    {ADDONS.map(addon => (
                        <button
                            key={addon.id}
                            onClick={() => toggleAddon(addon.id)}
                            className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all text-right ${
                                selectedAddons.includes(addon.id)
                                    ? 'border-primary bg-primary/5'
                                    : 'border-border hover:border-primary/50'
                            }`}
                        >
                            <div className="flex items-center gap-3">
                                <div className={`w-4 h-4 rounded border-2 flex items-center justify-center ${
                                    selectedAddons.includes(addon.id)
                                        ? 'border-primary bg-primary'
                                        : 'border-muted-foreground/30'
                                }`}>
                                    {selectedAddons.includes(addon.id) && (
                                        <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path d="M2 6l3 3 5-5" />
                                        </svg>
                                    )}
                                </div>
                                <span className="text-sm">{addon.nameHe}</span>
                            </div>
                            <span className="text-sm font-medium">₪{addon.priceIls}/חודש</span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Summary */}
            <div className="mt-8 p-5 rounded-2xl bg-card border border-border">
                <div className="flex justify-between items-center mb-3">
                    <span className="text-sm text-muted-foreground">תוכנית</span>
                    <span className="font-semibold">{pricing.plan.nameHe}</span>
                </div>
                <div className="flex justify-between items-center mb-3">
                    <span className="text-sm text-muted-foreground">RAM נדרש</span>
                    <span className="text-sm">{pricing.ramNeeded}GB / {pricing.plan.ram}GB</span>
                </div>
                {pricing.addonsPrice > 0 && (
                    <div className="flex justify-between items-center mb-3">
                        <span className="text-sm text-muted-foreground">תוספות</span>
                        <span className="text-sm">₪{pricing.addonsPrice}/חודש</span>
                    </div>
                )}
                <div className="border-t border-border pt-3 mt-3">
                    <div className="flex justify-between items-center">
                        <span className="font-bold text-lg">סה״כ</span>
                        <span className="font-bold text-2xl text-primary">₪{pricing.totalPrice}<span className="text-sm font-normal text-muted-foreground">/חודש</span></span>
                    </div>
                </div>

                <button
                    onClick={() => onDeploy({ components: selected, automationTool, addons: selectedAddons })}
                    disabled={selected.length === 0}
                    className="w-full mt-4 py-3 px-6 rounded-xl bg-primary text-primary-foreground font-semibold text-base transition-all hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    הפעילו עכשיו — ₪{pricing.totalPrice}/חודש
                </button>
                <p className="text-xs text-center text-muted-foreground mt-2">
                    VPS מוכן תוך 3 דקות · ביטול בכל עת · כל המחירים כוללים מע״מ
                </p>
            </div>
        </div>
    )
}

export default Configurator
