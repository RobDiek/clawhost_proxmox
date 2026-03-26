import type { Context } from 'hono'
import { ok, fail } from '@/lib/response'
import telegram from '@/services/telegram'

export const submitSupportRequest = async (c: Context) => {
    try {
        const body = await c.req.json()
        const { name, contact, message } = body as {
            name: string
            contact: string
            message: string
        }

        if (!name || !contact || !message) {
            return fail(c, 'All fields are required.', 400)
        }

        const text = [
            '📩 *פנייה חדשה מהאתר*',
            '',
            `👤 *שם:* ${name}`,
            `📱 *ליצירת קשר:* ${contact}`,
            '',
            `💬 *הודעה:*`,
            message,
            '',
            `🕐 ${new Date().toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' })}`,
        ].join('\n')

        await telegram.alertAdmin(text)

        return ok(c, null, 'Support request sent.')
    } catch (err) {
        console.error('Support request error:', err)
        return fail(c, 'Failed to send support request.', 500)
    }
}
