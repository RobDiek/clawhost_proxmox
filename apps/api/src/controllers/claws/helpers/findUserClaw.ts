import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { claws } from '@/db/schema'
import decryptClawSecrets from '@/controllers/claws/helpers/decryptClawSecrets'

const findUserClaw = async (
    userId: string,
    clawId: string,
    isAdmin = false
) => {
    const claw = await db
        .select()
        .from(claws)
        .where(eq(claws.id, clawId))
        .limit(1)

    if (!claw[0]) return null
    if (claw[0].userId !== userId && !isAdmin) return null

    return decryptClawSecrets(claw[0])
}

export default findUserClaw