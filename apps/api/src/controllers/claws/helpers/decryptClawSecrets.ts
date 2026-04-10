import { decrypt } from '@/lib/encryption'

const decryptClawSecrets = <
    T extends { rootPassword?: string | null; gatewayToken?: string | null }
>(
    claw: T
): T => ({
    ...claw,
    rootPassword: claw.rootPassword
        ? decrypt(claw.rootPassword)
        : claw.rootPassword,
    gatewayToken: claw.gatewayToken
        ? decrypt(claw.gatewayToken)
        : claw.gatewayToken
})

export default decryptClawSecrets