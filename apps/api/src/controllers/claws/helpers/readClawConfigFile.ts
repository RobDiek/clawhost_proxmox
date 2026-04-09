import type { ClawRow } from '@/ts/Types'
import type { ReadClawConfigFileOptions } from '@/ts/Interfaces'

import executeSSH from '@/services/ssh'
import ClawMissingCredentialsError from '@/controllers/claws/helpers/clawMissingCredentialsError'
import ClawConfigReadError from '@/controllers/claws/helpers/clawConfigReadError'

const readClawConfigFile = async <T>(
    claw: ClawRow,
    absolutePath: string,
    parser: (raw: string) => T,
    options: ReadClawConfigFileOptions = {}
): Promise<T> => {
    if (!claw.ip || !claw.rootPassword) throw new ClawMissingCredentialsError()

    const fallback = options.fallback ?? ''
    const timeout = options.timeout ?? 5000
    const command = `cat ${absolutePath} 2>/dev/null || echo '${fallback}'`

    let raw: string
    try {
        raw = await executeSSH(claw.ip, claw.rootPassword, command, timeout)
    } catch (error) {
        throw new ClawConfigReadError(
            error instanceof Error ? error.message : 'SSH read failed'
        )
    }

    return parser(raw)
}

export default readClawConfigFile