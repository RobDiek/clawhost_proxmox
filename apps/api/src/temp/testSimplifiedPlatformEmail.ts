import 'dotenv/config'
import { getResend, FROM_EMAIL } from '@/services/resend'
import SimplifiedPlatformEmail from '@/emails/SimplifiedPlatformEmail'
import { t } from '@openclaw/i18n'

const TEST_EMAIL = process.argv[2]

if (!TEST_EMAIL) {
    console.error(
        'testSimplifiedPlatformEmail',
        'Usage: tsx src/temp/testSimplifiedPlatformEmail.ts <your-email>'
    )
    process.exit(1)
}

const run = async () => {
    const resend = getResend()

    console.error(
        'testSimplifiedPlatformEmail',
        `Sending test to ${TEST_EMAIL}`
    )

    const { error } = await resend.emails.send({
        from: FROM_EMAIL,
        to: TEST_EMAIL,
        subject: t('emails.features.simplifiedPlatform.subject'),
        react: SimplifiedPlatformEmail({})
    })

    if (error) {
        console.error('testSimplifiedPlatformEmail', error)
        process.exit(1)
    }

    console.error('testSimplifiedPlatformEmail', 'Sent successfully')
    process.exit(0)
}

run()