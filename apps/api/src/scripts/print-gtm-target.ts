import { db } from '@/db'
import { matehAgents } from '@/db/schema'
import { eq } from 'drizzle-orm'
async function main() {
    const [a] = await db.select().from(matehAgents).where(eq(matehAgents.id, process.argv[2] || 'mta_Un9jXRuf'))
    const t: any = (a?.researchData as any)?.mazhirGtm?.target || {}
    console.log('publicId:', t.publicId, '| accountId:', t.accountId, '| containerId:', t.containerId, '| measurementId:', t.measurementId)
    const sr: any = (a?.researchData as any)?.mazhirGtm?.setupResult || {}
    console.log('lastSetup created:', (sr.created || []).length, 'published:', sr.published, 'version:', sr.versionId)
    process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })