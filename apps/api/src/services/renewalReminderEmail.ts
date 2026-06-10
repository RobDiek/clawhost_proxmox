/**
 * Annual renewal reminder email (S3 step 3).
 *
 * AllPay supports ONLY monthly recurring billing, so an ANNUAL plan is a one-time
 * yearly charge with no auto-renew. ~14 days before next_billing_at the
 * renewalReminder cron sends this so the customer can re-subscribe before their
 * agent's subscription lapses. Idempotency (one send per cycle) is the cron's job
 * (instances.renewal_reminder_sent_at).
 *
 * Hebrew, RTL, 2nd-person plural (אתם/תוכלו/לכם).
 */
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { instances, users } from '@/db/schema'
import { getResend, FROM_EMAIL } from '@/services/resend'

const DASHBOARD_URL = 'https://app.flowmatic.co.il/dashboard'
const SUPPORT_EMAIL = 'support@flowmatic.co.il'

function esc(s: unknown): string {
    return String(s ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

export async function sendRenewalReminder(
    instanceId: string
): Promise<{ sent: boolean; reason?: string }> {
    const [inst] = await db.select().from(instances).where(eq(instances.id, instanceId))
    if (!inst) return { sent: false, reason: 'instance not found' }
    if (!inst.userId) return { sent: false, reason: 'no userId' }
    const [user] = await db.select().from(users).where(eq(users.id, inst.userId))
    if (!user?.email) return { sent: false, reason: 'no user email' }

    const endDate = inst.nextBillingAt
        ? new Date(inst.nextBillingAt).toLocaleDateString('he-IL')
        : ''
    const greeting = user.name ? `שלום ${esc(user.name)},` : 'שלום,'

    const html = `<!DOCTYPE html>
<html lang="he" dir="rtl"><head><meta charset="UTF-8"><title>חידוש המנוי השנתי — Flowmatic</title></head>
<body style="margin:0;padding:0;background:#F5F7FA;font-family:Arial,'Arial Hebrew',Helvetica,sans-serif;color:#1F2937;direction:rtl">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F5F7FA;padding:32px 16px"><tr><td align="center">
  <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.06)">
    <tr><td style="background:linear-gradient(135deg,#2563EB,#1D4ED8);padding:32px;text-align:center">
      <div style="font-size:38px;margin-bottom:8px">🔔</div>
      <h1 style="margin:0;color:#fff;font-size:1.4rem;font-weight:700">המנוי השנתי שלכם עומד להסתיים</h1>
    </td></tr>
    <tr><td style="padding:30px 32px 8px">
      <p style="margin:0 0 14px;font-size:1rem;line-height:1.7">${greeting}</p>
      <p style="margin:0 0 14px;font-size:0.95rem;line-height:1.75;color:#374151">
        תודה שאתם איתנו ב-<strong>Flowmatic</strong>. המנוי השנתי שלכם ${endDate ? `מסתיים בתאריך <strong>${esc(endDate)}</strong>` : 'עומד להסתיים בקרוב'}.
      </p>
      <p style="margin:0 0 22px;font-size:0.95rem;line-height:1.75;color:#374151">
        כדי שהסוכן שלכם ימשיך לעבוד ללא הפסקה — חדשו את המנוי מראש. אפשר חודשי (מתחדש אוטומטית) או שנתי (18%- הנחה).
      </p>
      <div style="text-align:center;margin:8px 0 24px">
        <a href="${DASHBOARD_URL}" style="display:inline-block;background:#2563EB;color:#fff;font-weight:700;font-size:0.95rem;padding:12px 30px;border-radius:10px;text-decoration:none">חדשו את המנוי ←</a>
      </div>
    </td></tr>
    <tr><td style="padding:18px 32px 28px;border-top:1px solid #E5E7EB">
      <p style="margin:12px 0 0;font-size:0.85rem;color:#6B7280;line-height:1.7">
        שאלות? אנחנו פה: <a href="mailto:${SUPPORT_EMAIL}" style="color:#2563EB;text-decoration:none">${SUPPORT_EMAIL}</a><br>הצוות של Flowmatic
      </p>
    </td></tr>
    <tr><td style="padding:16px 32px;background:#F9FAFB;text-align:center;font-size:0.74rem;color:#9CA3AF">Flowmatic · ©&nbsp;2026</td></tr>
  </table>
</td></tr></table></body></html>`

    const text = [
        greeting.replace(/<[^>]+>/g, ''),
        '',
        `המנוי השנתי שלכם ב-Flowmatic ${endDate ? 'מסתיים בתאריך ' + endDate : 'עומד להסתיים בקרוב'}.`,
        'כדי שהסוכן ימשיך לעבוד — חדשו את המנוי:',
        DASHBOARD_URL,
        '',
        `תמיכה: ${SUPPORT_EMAIL}`,
        'הצוות של Flowmatic',
    ].join('\n')

    try {
        const { error } = await getResend().emails.send({
            from: FROM_EMAIL,
            to: user.email,
            subject: '🔔 המנוי השנתי שלכם ב-Flowmatic עומד להסתיים',
            html,
            text,
        })
        if (error) {
            console.error('[renewalReminder] Resend error:', error)
            return { sent: false, reason: `resend: ${error.message || JSON.stringify(error)}` }
        }
        console.log(`[renewalReminder] sent to ${user.email} for instance ${instanceId}`)
        return { sent: true }
    } catch (err) {
        console.error('[renewalReminder] send failed:', err)
        return { sent: false, reason: (err as Error).message }
    }
}