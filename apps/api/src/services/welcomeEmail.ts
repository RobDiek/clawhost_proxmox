/**
 * Welcome email — sent when install.sh finishes and instance status flips to 'running'.
 *
 * Hebrew-only, RTL, with all credentials the user needs to reach OpenClaw +
 * automation tool + dashboard. One-time send (idempotent on installComplete).
 */

import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { instances, users } from '@/db/schema'
import { getResend, FROM_EMAIL } from '@/services/resend'

const DASHBOARD_URL = 'https://app.flowmatic.co.il/dashboard'
const SUPPORT_EMAIL = 'support@flowmatic.co.il'

interface SendArgs {
    instanceId: string
}

function escapeHtml(s: any): string {
    return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
}

function buildHtml(args: {
    name?: string
    planLabel: string
    componentsLabel: string
    agentUrl: string
    flowsUrl: string
    openclawToken: string
    automationPassword: string
    rootPassword?: string
    automationLabel: string
}): string {
    const greeting = args.name ? `שלום ${escapeHtml(args.name)},` : 'שלום וברוכים הבאים,'
    return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="UTF-8">
<title>הסביבה שלכם מוכנה — Flowmatic</title>
</head>
<body style="margin:0;padding:0;background:#F5F7FA;font-family:Arial,'Arial Hebrew',Helvetica,sans-serif;color:#1F2937;direction:rtl">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F5F7FA;padding:32px 16px">
  <tr><td align="center">
    <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background:#FFFFFF;border-radius:14px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.06)">

      <tr><td style="background:linear-gradient(135deg,#2563EB,#1D4ED8);padding:36px 32px;text-align:center">
        <div style="font-size:40px;line-height:1;margin-bottom:10px">🎉</div>
        <h1 style="margin:0;color:#fff;font-size:1.55rem;font-weight:700;letter-spacing:-0.3px">הסביבה שלכם מוכנה!</h1>
        <p style="margin:8px 0 0;color:rgba(255,255,255,0.92);font-size:0.95rem">${escapeHtml(args.planLabel)} · ${escapeHtml(args.componentsLabel)}</p>
      </td></tr>

      <tr><td style="padding:32px 32px 8px">
        <p style="margin:0 0 14px;font-size:1rem;line-height:1.7">${greeting}</p>
        <p style="margin:0 0 14px;font-size:0.95rem;line-height:1.75;color:#374151">
          תודה שבחרתם ב-<strong style="color:#1F2937">Flowmatic</strong>. הסביבה שלכם הוקמה בהצלחה — שרת VPS פעיל, סוכני AI מותקנים, ו-SSL ודומיין מאובטחים. הכל מוכן לעבודה.
        </p>
        <p style="margin:0 0 22px;font-size:0.95rem;line-height:1.75;color:#374151">
          להלן הקישורים והפרטים שלכם. שמרו את המייל הזה במקום בטוח — הסיסמאות נחוצות לגישה.
        </p>
      </td></tr>

      <tr><td style="padding:0 32px 4px">
        <h3 style="margin:8px 0 12px;font-size:1rem;color:#111827">🔗 קישורים מהירים</h3>
      </td></tr>

      <tr><td style="padding:0 32px 12px">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:separate;border-spacing:0 6px">
          <tr><td style="background:#F0F4FF;border:1px solid #DDE6FF;border-radius:10px;padding:14px 16px">
            <div style="font-size:0.8rem;color:#6B7280;margin-bottom:4px">לוח הבקרה הראשי</div>
            <a href="${escapeHtml(DASHBOARD_URL)}" style="color:#2563EB;font-weight:700;font-size:0.95rem;text-decoration:none">${DASHBOARD_URL} →</a>
          </td></tr>
        </table>
      </td></tr>

      <tr><td style="padding:14px 32px 4px">
        <h3 style="margin:8px 0 12px;font-size:1rem;color:#111827">🔑 פרטי גישה</h3>
        <p style="margin:0 0 10px;font-size:0.85rem;color:#6B7280;line-height:1.6">
          סיסמאות וטוקנים אישיים. אל תשתפו אותם — מי שיש לו אותם נכנס לסביבה שלכם.
        </p>
      </td></tr>

      <tr><td style="padding:0 32px 12px">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:separate;border-spacing:0 6px">
          <tr><td style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:10px;padding:14px 16px">
            <div style="font-size:0.8rem;color:#92400E;margin-bottom:4px">OpenClaw Token</div>
            <code style="display:block;background:#fff;border:1px solid #FDE68A;border-radius:6px;padding:8px 10px;font-family:'SF Mono',Consolas,monospace;font-size:0.78rem;color:#1F2937;direction:ltr;text-align:left;word-break:break-all">${escapeHtml(args.openclawToken)}</code>
          </td></tr>
          ${args.rootPassword ? `<tr><td style="background:#FEF2F2;border:1px solid #FECACA;border-radius:10px;padding:14px 16px">
            <div style="font-size:0.8rem;color:#991B1B;margin-bottom:4px">סיסמת root (SSH) — למפתחים בלבד</div>
            <code style="display:block;background:#fff;border:1px solid #FECACA;border-radius:6px;padding:8px 10px;font-family:'SF Mono',Consolas,monospace;font-size:0.85rem;color:#1F2937;direction:ltr;text-align:left">${escapeHtml(args.rootPassword)}</code>
            <div style="font-size:0.74rem;color:#6B7280;margin-top:6px">לרוב המשתמשים אין צורך בסיסמה הזו — היא נחוצה רק לגישה ישירה לשרת דרך SSH.</div>
          </td></tr>` : ''}
        </table>
      </td></tr>

      <tr><td style="padding:18px 32px 8px">
        <h3 style="margin:8px 0 12px;font-size:1rem;color:#111827">🚀 מה הלאה?</h3>
        <ol style="margin:0 0 14px 0;padding-right:20px;font-size:0.92rem;color:#374151;line-height:1.85">
          <li>היכנסו ללוח הבקרה — שם תוכלו לחבר מודל AI (Anthropic / OpenAI), בוט טלגרם, ולהגדיר את הסוכן.</li>
          <li>חברו את חשבונות הצד שלכם (Google, Meta) דרך מסך ההגדרות.</li>
          <li>הסוכן יתחיל לעבוד עבורכם — אם יש שאלות בדרך, אנחנו פה לעזור.</li>
        </ol>
        <div style="text-align:center;margin:24px 0 8px">
          <a href="${escapeHtml(DASHBOARD_URL)}" style="display:inline-block;background:#2563EB;color:#fff;font-weight:700;font-size:0.95rem;padding:12px 28px;border-radius:10px;text-decoration:none">פתחו את לוח הבקרה ←</a>
        </div>
      </td></tr>

      <tr><td style="padding:24px 32px 32px;border-top:1px solid #E5E7EB;margin-top:8px">
        <p style="margin:14px 0 8px;font-size:0.92rem;color:#374151;line-height:1.75">
          איחולים חמים להצלחה ולעבודה פורייה עם הסוכנים שלכם. אנחנו מאחלים לכם שתפיקו ערך אמיתי, תחסכו זמן, ותגלו אפשרויות חדשות שלא חשבתם עליהן קודם. <strong>אם משהו לא עובד או נראה לא ברור — פשוט כתבו לנו.</strong>
        </p>
        <p style="margin:14px 0 0;font-size:0.85rem;color:#6B7280;line-height:1.7">
          תמיכה: <a href="mailto:${SUPPORT_EMAIL}" style="color:#2563EB;text-decoration:none">${SUPPORT_EMAIL}</a><br>
          הצוות של Flowmatic
        </p>
      </td></tr>

      <tr><td style="padding:18px 32px;background:#F9FAFB;text-align:center;font-size:0.74rem;color:#9CA3AF;line-height:1.6">
        Flowmatic · ©&nbsp;2026<br>
        מייל זה נשלח בעקבות הקמת חשבון פעיל. אין צורך להגיב — אבל תמיד אפשר.
      </td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>`
}

function buildPlainText(args: {
    name?: string
    planLabel: string
    agentUrl: string
    flowsUrl: string
    openclawToken: string
    automationPassword: string
    rootPassword?: string
    automationLabel: string
}): string {
    const lines: string[] = [
        args.name ? `שלום ${args.name},` : 'שלום וברוכים הבאים,',
        '',
        'הסביבה שלכם ב-Flowmatic מוכנה ופעילה!',
        `תוכנית: ${args.planLabel}`,
        '',
        '— קישורים מהירים —',
        `לוח הבקרה: ${DASHBOARD_URL}`,
        '',
        '— פרטי גישה —',
        `OpenClaw Token: ${args.openclawToken}`,
    ]
    if (args.rootPassword) lines.push(`Root SSH password (advanced): ${args.rootPassword}`)
    lines.push('',
        '— מה הלאה —',
        '1. היכנסו ללוח הבקרה לחיבור מודל AI ובוט טלגרם.',
        '2. חברו את חשבונות הצד (Google, Meta) דרך הגדרות.',
        '3. הסוכן יתחיל לעבוד עבורכם.',
        '',
        'בהצלחה ובעבודה פורייה!',
        'הצוות של Flowmatic',
        `תמיכה: ${SUPPORT_EMAIL}`,
    )
    return lines.join('\n')
}

const COMPONENT_LABELS_HE: Record<string, string> = {
    oc: 'OpenClaw Personal',
    bare: 'OpenClaw Bare',
    mt: 'MATEH — סוכן שיווקי',
    sv: 'נציג מכירות',
    ec: 'eCommerce Agent',
    ap: 'Activepieces',
    ol: 'Ollama (מודל מקומי)',
}

const PLAN_LABELS_HE: Record<string, string> = {
    personal: 'אישי',
    business: 'עסקי',
    pro: 'פרו',
    developer: 'מפתח',
}

export async function sendWelcomeEmailIfNeeded(args: SendArgs): Promise<{ sent: boolean; reason?: string }> {
    const { instanceId } = args
    const [inst] = await db.select().from(instances).where(eq(instances.id, instanceId))
    if (!inst) return { sent: false, reason: 'instance not found' }

    // Idempotency — skip if already sent
    if ((inst as any).welcomeEmailSentAt) {
        return { sent: false, reason: 'already sent' }
    }
    if (inst.status !== 'running') {
        return { sent: false, reason: `status is ${inst.status}, not running` }
    }
    if (!inst.userId) return { sent: false, reason: 'no userId' }

    const [user] = await db.select().from(users).where(eq(users.id, inst.userId))
    if (!user?.email) return { sent: false, reason: 'no user email' }

    const agentUrl = inst.subdomainAgent || `agent.${inst.subdomainName}.flowmatic.co.il`
    const flowsUrl = inst.subdomainFlows || `flows.${inst.subdomainName}.flowmatic.co.il`
    const automationLabel = inst.automationTool === 'activepieces' ? 'Activepieces'
        : inst.automationTool === 'n8n' ? 'n8n' : 'Activepieces'
    const planLabel = PLAN_LABELS_HE[inst.planKey || ''] || inst.planKey || 'תוכנית פעילה'
    const components = (inst.selectedComponents as string[] | null) || []
    const componentsLabel = components.map(c => COMPONENT_LABELS_HE[c] || c).join(' · ') || '—'

    const html = buildHtml({
        name: user.name || undefined,
        planLabel,
        componentsLabel,
        agentUrl,
        flowsUrl,
        openclawToken: inst.openclawToken || '',
        automationPassword: inst.automationPassword || '',
        rootPassword: (inst as any).rootPassword || undefined,
        automationLabel,
    })
    const text = buildPlainText({
        name: user.name || undefined,
        planLabel,
        agentUrl,
        flowsUrl,
        openclawToken: inst.openclawToken || '',
        automationPassword: inst.automationPassword || '',
        rootPassword: (inst as any).rootPassword || undefined,
        automationLabel,
    })

    try {
        const { error } = await getResend().emails.send({
            from: FROM_EMAIL,
            to: user.email,
            subject: '🎉 הסביבה שלכם ב-Flowmatic מוכנה',
            html,
            text,
        })
        if (error) {
            console.error('[welcomeEmail] Resend error:', error)
            return { sent: false, reason: `resend: ${error.message || JSON.stringify(error)}` }
        }
        // Mark as sent (best-effort — do not fail on this)
        try {
            await db.update(instances)
                .set({ welcomeEmailSentAt: new Date() } as any)
                .where(eq(instances.id, instanceId))
        } catch (err) {
            console.warn('[welcomeEmail] could not stamp welcomeEmailSentAt:', (err as Error).message)
        }
        console.log(`[welcomeEmail] sent to ${user.email} for instance ${instanceId}`)
        return { sent: true }
    } catch (err) {
        console.error('[welcomeEmail] send failed:', err)
        return { sent: false, reason: (err as Error).message }
    }
}