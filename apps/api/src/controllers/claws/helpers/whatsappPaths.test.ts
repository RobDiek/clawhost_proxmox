import { WHATSAPP_PATHS } from '@/controllers/claws/helpers'

describe('WHATSAPP_PATHS', () => {
    it('has all required paths', () => {
        expect(WHATSAPP_PATHS.PAIR_LOG).toBe('/tmp/openclaw-wa-pair.log')
        expect(WHATSAPP_PATHS.PAIR_PID).toBe('/tmp/openclaw-wa-pair.pid')
        expect(WHATSAPP_PATHS.PAIR_SCRIPT).toBe('/tmp/openclaw-wa-pair.sh')
        expect(WHATSAPP_PATHS.CREDS_DIR).toBe(
            '/home/openclaw/.openclaw/credentials/whatsapp'
        )
    })

    it('has exactly 4 path entries', () => {
        expect(Object.keys(WHATSAPP_PATHS)).toHaveLength(4)
    })
})