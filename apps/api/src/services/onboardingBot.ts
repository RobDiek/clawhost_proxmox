// Telegram Onboarding Bot — conversational agent setup
// Runs as part of the API process, polls for updates

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || ''
const API_BASE = process.env.API_URL || 'https://api.clawflow.flowmatic.co.il'

interface UserSession {
    step: number
    instanceId: string
    answers: Record<string, string>
    lastActivity: number
}

const sessions = new Map<number, UserSession>()

const QUESTIONS = [
    { key: 'businessName', he: '1/7 — מה שם העסק שלכם?', en: '1/7 — What is your business name?' },
    { key: 'businessDescription', he: '2/7 — מה אתם מוכרים / איזה שירות אתם נותנים?', en: '2/7 — What do you sell / what service do you provide?' },
    { key: 'targetAudience', he: '3/7 — מי קהל היעד שלכם? (תארו בחופשיות)', en: '3/7 — Who is your target audience?' },
    { key: 'competitors', he: '4/7 — מי המתחרים הישירים? (2-3 שמות + URL אם יש)', en: '4/7 — Who are your direct competitors? (2-3 names)' },
    { key: 'marketingGoals', he: '5/7 — מה המטרה העיקרית? (לידים / מכירות / בניית קהל / מודעות)', en: '5/7 — Main goal? (leads / sales / audience / awareness)' },
    { key: 'currentContent', he: '6/7 — איזה תוכן אתם מפרסמים היום? (או מתכננים?)', en: '6/7 — What content do you publish today?'},
    { key: 'challenges', he: '7/7 — מה הכי מתסכל אתכם בשיווק עכשיו?', en: '7/7 — What frustrates you most about marketing?' },
]

async function sendMessage(chatId: number, text: string, options?: { reply_markup?: object }): Promise<void> {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            chat_id: chatId,
            text,
            parse_mode: 'Markdown',
            ...options,
        }),
    })
}

async function handleMessage(chatId: number, text: string, userId: number): Promise<void> {
    const session = sessions.get(chatId)

    // Start command or no session
    if (text === '/start' || text === '/setup' || !session) {
        if (text === '/start') {
            await sendMessage(chatId,
                `👋 *שלום! אני הבוט של ClawFlow.*\n\n` +
                `אני יכול להגדיר את מערכת הסוכנים שלכם תוך כמה דקות.\n\n` +
                `כדי להתחיל, שלחו לי את מזהה ה-Instance שלכם:\n` +
                `(תמצאו אותו בלוח הבקרה → הגדרות → מתקדם)\n\n` +
                `או שלחו /setup כדי להתחיל.`
            )
            return
        }

        if (text === '/setup') {
            await sendMessage(chatId,
                `📋 *הגדרת סוכנים*\n\n` +
                `שלחו את מזהה ה-Instance שלכם.\n` +
                `(מופיע בלוח הבקרה או בכתובת ה-URL של הסוכן)`
            )
            sessions.set(chatId, { step: -1, instanceId: '', answers: {}, lastActivity: Date.now() })
            return
        }

        // First message without session — treat as instance ID
        sessions.set(chatId, { step: -1, instanceId: '', answers: {}, lastActivity: Date.now() })
    }

    const s = sessions.get(chatId)!
    s.lastActivity = Date.now()

    // Step -1: waiting for instance ID
    if (s.step === -1) {
        const instanceId = text.trim()

        // Verify instance exists
        try {
            const res = await fetch(`${API_BASE}/hosting/instances/${instanceId}/status`)
            const data = await res.json() as { success: boolean }

            if (!data.success) {
                await sendMessage(chatId, '❌ לא מצאתי Instance עם המזהה הזה. בדקו ונסו שוב.')
                return
            }
        } catch {
            await sendMessage(chatId, '❌ שגיאה בבדיקת ה-Instance. נסו שוב.')
            return
        }

        s.instanceId = instanceId
        s.step = 0

        await sendMessage(chatId,
            `✅ *מצאתי את ה-Instance שלכם!*\n\n` +
            `עכשיו אשאל 7 שאלות קצרות על העסק שלכם.\n` +
            `על סמך התשובות — אגדיר 9 סוכני AI מותאמים אישית.\n\n` +
            `אפשר לענות בטקסט או בהודעה קולית 🎤\n\n` +
            `${QUESTIONS[0].he}`
        )
        return
    }

    // Steps 0-6: collecting answers
    if (s.step >= 0 && s.step < QUESTIONS.length) {
        s.answers[QUESTIONS[s.step].key] = text
        s.step++

        if (s.step < QUESTIONS.length) {
            // Next question
            await sendMessage(chatId, QUESTIONS[s.step].he)
        } else {
            // All questions answered — deploy
            await sendMessage(chatId,
                `✅ *תודה! קיבלתי את כל המידע.*\n\n` +
                `⚙️ מגדיר את 9 הסוכנים שלכם...\n` +
                `זה ייקח כ-30 שניות.`
            )

            try {
                const res = await fetch(`${API_BASE}/hosting/instances/${s.instanceId}/setup/agents`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(s.answers),
                })

                const data = await res.json() as { success: boolean; message?: string }

                if (data.success) {
                    await sendMessage(chatId,
                        `🎉 *הסוכנים שלכם מוכנים!*\n\n` +
                        `✅ USER.md — נוצר\n` +
                        `✅ BRAND.md — נוצר\n` +
                        `✅ 9 סוכנים — הוגדרו\n` +
                        `✅ Skills — הותקנו\n` +
                        `✅ OpenClaw — הופעל מחדש\n\n` +
                        `📅 *מחר בבוקר ב-7:00* תקבלו את ה-Daily Brief הראשון כאן בטלגרם.\n\n` +
                        `📊 *כל יום שני ב-8:00* — דוח תחרותי שבועי.\n\n` +
                        `🔗 לוח הבקרה: https://clawflow.flowmatic.co.il/dashboard.html\n\n` +
                        `שלחו /help לעזרה נוספת.`
                    )
                } else {
                    await sendMessage(chatId,
                        `❌ *שגיאה בהגדרת הסוכנים*\n\n` +
                        `${data.message || 'נסו שוב או פנו לתמיכה.'}\n\n` +
                        `שלחו /setup כדי לנסות שוב.`
                    )
                }
            } catch (err) {
                await sendMessage(chatId,
                    `❌ *שגיאת תקשורת*\n\nנסו שוב: /setup`
                )
            }

            // Clean up session
            sessions.delete(chatId)
        }
        return
    }
}

// Help command
async function handleHelp(chatId: number): Promise<void> {
    await sendMessage(chatId,
        `📖 *פקודות זמינות:*\n\n` +
        `/start — התחלה\n` +
        `/setup — הגדרת סוכנים (7 שאלות)\n` +
        `/status — סטטוס הסוכנים\n` +
        `/help — עזרה\n\n` +
        `🌐 לוח בקרה: https://clawflow.flowmatic.co.il/dashboard.html\n` +
        `💬 תמיכה: support@flowmatic.co.il`
    )
}

// Status command
async function handleStatus(chatId: number): Promise<void> {
    // Find instance for this chat
    const session = sessions.get(chatId)
    if (session?.instanceId) {
        try {
            const res = await fetch(`${API_BASE}/hosting/instances/${session.instanceId}/status`)
            const data = await res.json() as { data?: { status: string } }
            await sendMessage(chatId, `📊 *סטטוס:* ${data.data?.status || 'לא ידוע'}`)
        } catch {
            await sendMessage(chatId, '❌ לא הצלחתי לבדוק סטטוס.')
        }
    } else {
        await sendMessage(chatId, 'שלחו קודם /setup כדי לחבר Instance.')
    }
}

// Polling loop
let lastUpdateId = 0

async function pollUpdates(): Promise<void> {
    if (!BOT_TOKEN) return

    try {
        const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getUpdates?offset=${lastUpdateId + 1}&timeout=30`)
        const data = await res.json() as { ok: boolean; result: Array<{ update_id: number; message?: { chat: { id: number }; from?: { id: number }; text?: string } }> }

        if (data.ok && data.result.length > 0) {
            for (const update of data.result) {
                lastUpdateId = update.update_id
                const msg = update.message
                if (!msg?.text || !msg.chat) continue

                const chatId = msg.chat.id
                const text = msg.text.trim()
                const userId = msg.from?.id || 0

                if (text === '/help') {
                    await handleHelp(chatId)
                } else if (text === '/status') {
                    await handleStatus(chatId)
                } else {
                    await handleMessage(chatId, text, userId)
                }
            }
        }
    } catch (err) {
        console.error('Bot polling error:', err)
    }
}

// Clean old sessions (>1 hour)
function cleanSessions(): void {
    const now = Date.now()
    for (const [chatId, session] of sessions) {
        if (now - session.lastActivity > 3600000) {
            sessions.delete(chatId)
        }
    }
}

// Start bot
export function startOnboardingBot(): void {
    if (!BOT_TOKEN) {
        console.log('Telegram bot token not set, skipping bot startup')
        return
    }

    console.log('🤖 Onboarding bot started')

    // Poll every 2 seconds
    setInterval(pollUpdates, 2000)

    // Clean sessions every 10 minutes
    setInterval(cleanSessions, 600000)
}