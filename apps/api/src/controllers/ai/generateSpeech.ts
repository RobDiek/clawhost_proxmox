import type { AuthenticatedContext } from '@/ts/Types'
import type { GenerateSpeechBody } from '@/ts/Interfaces'

import { existsSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { stream } from 'hono/streaming'
import synthesizeStream from '@/services/piper'
import { fail } from '@/lib/response'
import { t } from '@openclaw/i18n'
import withErrorHandler from '@/lib/withErrorHandler'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_VOICE = 'en_US-ryan-high'
const MODELS_DIR = path.resolve(
    process.env.PIPER_MODELS_DIR ||
        path.join(__dirname, '..', '..', '..', 'ai', 'models')
)

const generateSpeech = withErrorHandler(
    'generateSpeech',
    'api.ttsGenerationFailed'
)(async (c: AuthenticatedContext) => {
    const body = await c.req.json<GenerateSpeechBody>()

    if (!body.text || !body.text.trim()) {
        return fail(c, t('api.textRequired'), 400)
    }

    const voice = body.voice || DEFAULT_VOICE
    const modelPath = path.join(MODELS_DIR, `${voice}.onnx`)

    if (!existsSync(modelPath)) {
        return fail(c, t('api.voiceNotFound'), 400)
    }

    const { child, sampleRate, channels } = synthesizeStream(
        body.text.trim(),
        voice
    )

    c.header('Content-Type', 'application/octet-stream')
    c.header('X-Sample-Rate', String(sampleRate))
    c.header('X-Channels', String(channels))
    c.header('X-Audio-Format', 'pcm-s16le')

    return stream(c, async (s) => {
        await new Promise<void>((resolve, reject) => {
            if (!child.stdout) {
                reject(new Error('No stdout'))
                return
            }

            child.stdout.on('data', async (chunk: Buffer) => {
                await s.write(new Uint8Array(chunk))
            })

            child.stdout.on('end', () => {
                resolve()
            })

            child.on('error', (err) => {
                reject(err)
            })
        })
    })
})

export default generateSpeech