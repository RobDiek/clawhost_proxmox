import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'

const STEPS = [
    { id: 'deploying', title: 'מכינים את הסביבה', icon: '⚙️' },
    { id: 'ai-provider', title: 'חיבור מודל AI', icon: '🧠' },
    { id: 'telegram', title: 'חיבור טלגרם', icon: '💬' },
    { id: 'ready', title: 'מוכן!', icon: '🎉' },
]

const Onboarding: React.FC = () => {
    const { instanceId } = useParams<{ instanceId: string }>()
    const [currentStep, setCurrentStep] = useState(0)
    const [status, setStatus] = useState('provisioning')
    const [apiKey, setApiKey] = useState('')
    const [telegramToken, setTelegramToken] = useState('')
    const [urls, setUrls] = useState({ agent: '', flows: '' })

    useEffect(() => {
        if (currentStep !== 0) return

        const poll = setInterval(async () => {
            try {
                const token = localStorage.getItem('auth_token')
                const res = await fetch(`/api/hosting/instances/${instanceId}/status`, {
                    headers: { Authorization: `Bearer ${token}` }
                })
                const data = await res.json()

                if (data.data?.status === 'running') {
                    setUrls({
                        agent: `https://${data.data.subdomainAgent}`,
                        flows: `https://${data.data.subdomainFlows}`
                    })
                    setStatus('running')
                    setCurrentStep(1)
                    clearInterval(poll)
                } else if (data.data?.status === 'failed') {
                    setStatus('failed')
                    clearInterval(poll)
                }
            } catch {
                // continue polling
            }
        }, 10000)

        return () => clearInterval(poll)
    }, [instanceId, currentStep])

    const handleApiKey = async () => {
        // In production: save API key to instance via OpenClaw API
        setCurrentStep(2)
    }

    const handleTelegram = async () => {
        // In production: validate token and pair bot
        setCurrentStep(3)
    }

    return (
        <div className="min-h-screen bg-background" dir="rtl">
            <div className="max-w-2xl mx-auto px-6 py-16">
                {/* Progress */}
                <div className="flex items-center justify-between mb-12">
                    {STEPS.map((step, i) => (
                        <div key={step.id} className="flex items-center">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg transition-all ${
                                i <= currentStep
                                    ? 'bg-primary text-primary-foreground'
                                    : 'bg-muted text-muted-foreground'
                            }`}>
                                {step.icon}
                            </div>
                            {i < STEPS.length - 1 && (
                                <div className={`w-16 h-0.5 mx-2 transition-all ${
                                    i < currentStep ? 'bg-primary' : 'bg-border'
                                }`} />
                            )}
                        </div>
                    ))}
                </div>

                {/* Step 0: Deploying */}
                {currentStep === 0 && (
                    <div className="text-center space-y-6">
                        <div className="text-6xl animate-spin-slow">⚙️</div>
                        <h2 className="text-2xl font-bold">מכינים את הסביבה שלכם...</h2>
                        <p className="text-muted-foreground">VPS נוצר, מתקין OpenClaw — זה ייקח ~3 דקות</p>
                        <div className="space-y-3 text-right max-w-sm mx-auto">
                            <div className="flex items-center gap-3">
                                <span className="text-green-500">✓</span>
                                <span className="text-sm">יוצר שרת VPS</span>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className={status === 'provisioning' ? 'animate-pulse text-yellow-500' : 'text-green-500'}>
                                    {status === 'provisioning' ? '⏳' : '✓'}
                                </span>
                                <span className="text-sm">מגדיר DNS ו-SSL</span>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="text-muted-foreground">○</span>
                                <span className="text-sm text-muted-foreground">מתקין OpenClaw</span>
                            </div>
                        </div>
                        {status === 'failed' && (
                            <div className="p-4 bg-destructive/10 border border-destructive rounded-xl text-destructive text-sm">
                                ההגדרה נכשלה. נסו שוב או פנו לתמיכה.
                            </div>
                        )}
                    </div>
                )}

                {/* Step 1: AI Provider */}
                {currentStep === 1 && (
                    <div className="space-y-6">
                        <h2 className="text-2xl font-bold">🧠 חיבור מודל AI</h2>
                        <p className="text-muted-foreground">
                            OpenClaw צריך מפתח API של מודל AI. מומלץ: Claude של Anthropic.
                        </p>
                        <div className="p-4 bg-muted rounded-xl space-y-2 text-sm">
                            <p>1. היכנסו ל-<a href="https://console.anthropic.com" target="_blank" rel="noopener noreferrer" className="text-primary underline">console.anthropic.com</a></p>
                            <p>2. פתחו חשבון והוסיפו קרדיט ($40 מומלץ)</p>
                            <p>3. API Keys → Create Key → העתיקו</p>
                        </div>
                        <input
                            type="password"
                            value={apiKey}
                            onChange={(e) => setApiKey(e.target.value)}
                            placeholder="sk-ant-api..."
                            className="w-full p-3 rounded-xl border border-border bg-background text-sm"
                            dir="ltr"
                        />
                        <div className="flex gap-3">
                            <button
                                onClick={handleApiKey}
                                disabled={!apiKey}
                                className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-semibold disabled:opacity-50"
                            >
                                חבר והמשך
                            </button>
                            <button
                                onClick={() => setCurrentStep(2)}
                                className="py-3 px-6 rounded-xl border border-border text-muted-foreground hover:bg-accent"
                            >
                                דלג
                            </button>
                        </div>
                    </div>
                )}

                {/* Step 2: Telegram */}
                {currentStep === 2 && (
                    <div className="space-y-6">
                        <h2 className="text-2xl font-bold">💬 חיבור טלגרם</h2>
                        <p className="text-muted-foreground">חברו בוט טלגרם כדי לדבר עם הסוכן מכל מקום.</p>
                        <div className="p-4 bg-muted rounded-xl space-y-2 text-sm">
                            <p>1. פתחו שיחה עם <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer" className="text-primary underline">@BotFather</a> בטלגרם</p>
                            <p>2. שלחו /newbot → תנו שם → קבלו Token</p>
                            <p>3. הדביקו את ה-Token כאן</p>
                        </div>
                        <input
                            type="text"
                            value={telegramToken}
                            onChange={(e) => setTelegramToken(e.target.value)}
                            placeholder="1234567890:ABCdefGHIjklMNOpqrsTUVwxyz"
                            className="w-full p-3 rounded-xl border border-border bg-background text-sm"
                            dir="ltr"
                        />
                        <div className="flex gap-3">
                            <button
                                onClick={handleTelegram}
                                disabled={!telegramToken}
                                className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-semibold disabled:opacity-50"
                            >
                                חבר והמשך
                            </button>
                            <button
                                onClick={() => setCurrentStep(3)}
                                className="py-3 px-6 rounded-xl border border-border text-muted-foreground hover:bg-accent"
                            >
                                דלג
                            </button>
                        </div>
                    </div>
                )}

                {/* Step 3: Ready */}
                {currentStep === 3 && (
                    <div className="text-center space-y-6">
                        <div className="text-7xl">🎉</div>
                        <h2 className="text-3xl font-bold">הסוכן שלכם מוכן!</h2>
                        <p className="text-muted-foreground">הכל עובד. הינה הקישורים:</p>

                        <div className="space-y-3 max-w-md mx-auto">
                            <a
                                href={urls.agent}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="w-full flex items-center justify-between p-4 rounded-xl bg-primary text-primary-foreground font-semibold"
                            >
                                <span>🤖 פתח את OpenClaw</span>
                                <span>↗</span>
                            </a>
                            <a
                                href={urls.flows}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="w-full flex items-center justify-between p-4 rounded-xl border border-border hover:bg-accent font-medium"
                            >
                                <span>⚡ פתח Flows</span>
                                <span>↗</span>
                            </a>
                        </div>

                        <a
                            href="/claws"
                            className="inline-block mt-4 text-sm text-muted-foreground hover:text-primary transition-colors"
                        >
                            עבור לדashboard ←
                        </a>
                    </div>
                )}
            </div>
        </div>
    )
}

export default Onboarding
