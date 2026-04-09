import type {
    JoinWaitlistResponse,
    WaitlistStatusResponse
} from '@/ts/Interfaces'

import { apiPaths as API_PATHS } from '@openclaw/shared'
import { publicClient } from '@/lib/api/client'

const waitlist = {
    joinWaitlist: (email: string) =>
        publicClient.post<JoinWaitlistResponse>(API_PATHS.WAITLIST.BASE, {
            email
        }),
    checkWaitlistStatus: (email: string) =>
        publicClient.get<WaitlistStatusResponse>(
            `${API_PATHS.WAITLIST.STATUS}?email=${encodeURIComponent(email)}`
        )
}

export default waitlist