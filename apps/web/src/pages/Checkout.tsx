import type { FC, ReactNode } from 'react'
import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { calcTotal, COMPONENTS } from '@openclaw/shared'
import { useCheckout } from '@/hooks/useInstances'

const Checkout: FC = (): ReactNode => {
    const location = useLocation()
    const config = location.state as {
        components: string[]
        automationTool: 'n8n' | 'activepieces' | 'dify'
        addons: string[]
    } | null

    const [name, setName] = useState('')
    const [email, setEmail] = useState('')
    const [phone, setPhone] = useState('')
    const [loading, setLoading] = useState(false)

    const checkoutMutation = useCheckout()

    if (!config) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center" dir="rtl">
                <div className="text-center">
                    <h2 className="text-xl font-bold mb-2">אין הגדרה</h2>
                    <p className="text-muted-foreground mb-4">חזרו לדף הבית ובחרו סוכנים.</p>
                    <a href="/" className="text-primary hover:underline">חזרה לדף הבית ←</a>
                </div>
            </div>
        )
    }

    const pricing = calcTotal(config.components, config.addons)
    const selectedComponents = config.components
        .map(id => COMPONENTS.find(c => c.id === id))
        .filter(Boolean)

    const handleSubmit = async () => {
        if (!name || !email) return
        setLoading(true)

        try {
            const result = await checkoutMutation.mutateAsync({
                components: config.components,
                automationTool: config.automationTool,
                addons: config.addons,
                customerEmail: email,
                customerName: name,
                customerPhone: phone
            })

            const paymentUrl = (result as any).data?.paymentUrl
            if (paymentUrl) {
                window.location.href = paymentUrl
            }
        } catch (err) {
            console.error('Checkout failed:', err)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="min-h-screen bg-background" dir="rtl">
            <div className="max-w-2xl mx-auto px-6 py-16">
                <h1 className="text-2xl font-bold mb-2">סיכום הזמנה</h1>
                <p className="text-muted-foreground mb-8">בדקו את הפרטים ומלאו את הטופס.</p>

                {/* Order Summary */}
                <div className="p-5 rounded-2xl border border-border bg-card mb-8">
                    <h3 className="font-semibold mb-4">מה כלול</h3>

                    <div className="space-y-2 mb-4">
                        {selectedComponents.map(comp => comp && (
                            <div key={comp.id} className="flex justify-between text-sm">
                                <span>{comp.nameHe}</span>
                                <span className="text-muted-foreground">{comp.ram}GB RAM</span>
                            </div>
                        ))}
                        <div className="flex justify-between text-sm">
                            <span>כלי אוטומציה</span>
                            <span className="text-muted-foreground">{config.automationTool}</span>
                        </div>
                    </div>

                    <div className="border-t border-border pt-3 space-y-2">
                        <div className="flex justify-between text-sm">
                            <span>תוכנית</span>
                            <span className="font-medium">{pricing.plan.nameHe} — {pricing.plan.cpu} CPU, {pricing.plan.ram}GB RAM</span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span>שרת</span>
                            <span className="text-muted-foreground">Hetzner {pricing.plan.hetznerType}, Helsinki</span>
                        </div>
                        {pricing.addonsPrice > 0 && (
                            <div className="flex justify-between text-sm">
                                <span>תוספות</span>
                                <span>₪{pricing.addonsPrice}/חודש</span>
                            </div>
                        )}
                    </div>

                    <div className="border-t border-border pt-3 mt-3">
                        <div className="flex justify-between items-center">
                            <span className="font-bold text-lg">סה״כ</span>
                            <span className="font-bold text-2xl text-primary">₪{pricing.totalPrice}<span className="text-sm font-normal text-muted-foreground">/חודש</span></span>
                        </div>
                    </div>
                </div>

                {/* Customer Form */}
                <div className="space-y-4 mb-8">
                    <div>
                        <label className="text-sm font-medium text-muted-foreground mb-1.5 block">שם מלא *</label>
                        <input
                            type="text"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            placeholder="השם שלכם"
                            className="w-full p-3 rounded-xl border border-border bg-background text-sm"
                        />
                    </div>
                    <div>
                        <label className="text-sm font-medium text-muted-foreground mb-1.5 block">אימייל *</label>
                        <input
                            type="email"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            placeholder="email@example.com"
                            className="w-full p-3 rounded-xl border border-border bg-background text-sm"
                            dir="ltr"
                        />
                    </div>
                    <div>
                        <label className="text-sm font-medium text-muted-foreground mb-1.5 block">טלפון</label>
                        <input
                            type="tel"
                            value={phone}
                            onChange={e => setPhone(e.target.value)}
                            placeholder="050-0000000"
                            className="w-full p-3 rounded-xl border border-border bg-background text-sm"
                            dir="ltr"
                        />
                    </div>
                </div>

                <button
                    onClick={handleSubmit}
                    disabled={!name || !email || loading}
                    className="w-full py-3.5 rounded-xl bg-primary text-primary-foreground font-semibold text-base hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                    {loading ? 'מעבד...' : `עבור לתשלום — ₪${pricing.totalPrice}/חודש`}
                </button>
                <p className="text-xs text-center text-muted-foreground mt-3">
                    תשלום מאובטח דרך AllPay · חשבונית מס אוטומטית · ביטול בכל עת
                </p>
            </div>
        </div>
    )
}

export default Checkout