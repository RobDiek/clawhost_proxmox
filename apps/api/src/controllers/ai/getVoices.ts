import type { AuthenticatedContext } from '@/ts/Types'
import type { PiperVoice } from '@/ts/Interfaces'

import { ok } from '@/lib/response'
import { piperVoiceQuality } from '@/lib/constants'
import { t } from '@openclaw/i18n'

const voices: PiperVoice[] = [
    {
        id: 'en_US-ryan-high',
        name: 'Ryan (US)',
        gender: 'male',
        quality: piperVoiceQuality.high
    },
    {
        id: 'en_US-ryan-medium',
        name: 'Ryan (US)',
        gender: 'male',
        quality: piperVoiceQuality.medium
    },
    {
        id: 'en_US-joe-medium',
        name: 'Joe (US)',
        gender: 'male',
        quality: piperVoiceQuality.medium
    },
    {
        id: 'en_US-john-medium',
        name: 'John (US)',
        gender: 'male',
        quality: piperVoiceQuality.medium
    },
    {
        id: 'en_US-bryce-medium',
        name: 'Bryce (US)',
        gender: 'male',
        quality: piperVoiceQuality.medium
    },
    {
        id: 'en_US-danny-low',
        name: 'Danny (US)',
        gender: 'male',
        quality: piperVoiceQuality.low
    },
    {
        id: 'en_US-amy-medium',
        name: 'Amy (US)',
        gender: 'female',
        quality: piperVoiceQuality.medium
    },
    {
        id: 'en_US-lessac-high',
        name: 'Lessac (US)',
        gender: 'female',
        quality: piperVoiceQuality.high
    },
    {
        id: 'en_US-lessac-medium',
        name: 'Lessac (US)',
        gender: 'female',
        quality: piperVoiceQuality.medium
    },
    {
        id: 'en_US-kristin-medium',
        name: 'Kristin (US)',
        gender: 'female',
        quality: piperVoiceQuality.medium
    },
    {
        id: 'en_US-hfc_male-medium',
        name: 'HFC Male (US)',
        gender: 'male',
        quality: piperVoiceQuality.medium
    },
    {
        id: 'en_US-hfc_female-medium',
        name: 'HFC Female (US)',
        gender: 'female',
        quality: piperVoiceQuality.medium
    },
    {
        id: 'en_US-libritts-high',
        name: 'LibriTTS (US)',
        gender: 'mixed',
        quality: piperVoiceQuality.high
    },
    {
        id: 'en_GB-alan-medium',
        name: 'Alan (GB)',
        gender: 'male',
        quality: piperVoiceQuality.medium
    },
    {
        id: 'en_GB-cori-high',
        name: 'Cori (GB)',
        gender: 'female',
        quality: piperVoiceQuality.high
    },
    {
        id: 'en_GB-jenny_dioco-medium',
        name: 'Jenny (GB)',
        gender: 'female',
        quality: piperVoiceQuality.medium
    },
    {
        id: 'en_GB-northern_english_male-medium',
        name: 'Northern Male (GB)',
        gender: 'male',
        quality: piperVoiceQuality.medium
    }
]

const getVoices = async (c: AuthenticatedContext) => {
    return ok(c, { voices }, t('api.voicesFetched'))
}

export default getVoices