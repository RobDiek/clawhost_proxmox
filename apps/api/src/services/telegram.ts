const getToken = () => {
    const token = process.env.TELEGRAM_BOT_TOKEN
    if (!token) throw new Error('TELEGRAM_BOT_TOKEN is not set!')
    return token
}

const getSupportChatId = () => {
    const id = process.env.TELEGRAM_SUPPORT_CHAT_ID
    if (!id) throw new Error('TELEGRAM_SUPPORT_CHAT_ID is not set!')
    return id
}

async function sendMessage(chatId: string, text: string, parseMode: 'Markdown' | 'HTML' = 'Markdown'): Promise<void> {
    const token = getToken()
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            chat_id: chatId,
            text,
            parse_mode: parseMode,
        }),
    })
}

const telegram = {
    sendMessage,

    async notifyProvisioning(chatId: string, instanceId: string): Promise<void> {
        await sendMessage(chatId,
            `⚙️ *מכין את הסביבה שלך...*\n` +
            `VPS נוצר, מתקין OpenClaw\n` +
            `זה ייקח ~3 דקות 🕐`
        )
    },

    async notifyReady(chatId: string, urls: { agent: string; flows: string }): Promise<void> {
        await sendMessage(chatId,
            `✅ *הסוכן שלך מוכן!*\n\n` +
            `🤖 OpenClaw: ${urls.agent}\n` +
            `⚡ Flows: ${urls.flows}\n\n` +
            `_לחץ על הקישור כדי להתחיל_`
        )
    },

    async notifyPaymentFailed(chatId: string, retryUrl: string): Promise<void> {
        await sendMessage(chatId,
            `⚠️ *תשלום נכשל*\n` +
            `[עדכן פרטי תשלום](${retryUrl})`
        )
    },

    async notifyInstanceDown(chatId: string, name: string): Promise<void> {
        await sendMessage(chatId,
            `🔴 *הסוכן ${name} לא מגיב*\n` +
            `מנסים להפעיל מחדש אוטומטית...`
        )
    },

    async alertAdmin(message: string): Promise<void> {
        const chatId = getSupportChatId()
        await sendMessage(chatId, `🔔 *Admin Alert*\n${message}`)
    },
}

export default telegram