import type {
    ResolveCredentialConflictData,
    VerifyOtpResponse
} from '@/ts/Interfaces'

import { apiPaths as API_PATHS } from '@openclaw/shared'
import { publicClient } from '@/lib/api/client'

const auth = {
    sendOtp: (email: string) =>
        publicClient.post<void>(API_PATHS.AUTH.SEND_OTP, { email }),
    verifyOtp: (email: string, code: string) =>
        publicClient.post<VerifyOtpResponse>(API_PATHS.AUTH.VERIFY_OTP, {
            email,
            code
        }),
    resolveCredentialConflict: (data: ResolveCredentialConflictData) =>
        publicClient.post<VerifyOtpResponse>(
            API_PATHS.AUTH.RESOLVE_CONFLICT,
            data
        )
}

export default auth