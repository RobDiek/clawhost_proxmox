/**
 * Phase QA round-9 standalone DB patch — runs the Hebrew cleanup pass on an
 * already-persisted stage record. Used to fix code-switched content without
 * paying for a full stage re-generation.
 *
 * Usage on prod:
 *   cd /opt/openclaw-hosting/apps/api
 *   pnpm tsx -e 'import "dotenv/config"; import("./src/scripts/db-patch-hebrew-cleanup.ts")' \
 *     <instanceId> <stageId>
 *
 * Reads research_data.results[stageId].{content, records}, runs Sonnet
 * cleanup, writes back via jsonb_set. Idempotent — safe to re-run.
 */

import 'dotenv/config'
import { db } from '@/db'
import { instances } from '@/db/schema'
import { eq, sql } from 'drizzle-orm'
import { runHebrewCleanup } from '@/services/research/hebrewCleanup'
import type { ResearchDataV2, StageId } from '@/services/research/types'

async function main(): Promise<void> {
    const args = process.argv.slice(2)
    const instanceId = args[0] || '44f484a852'
    const stageId = (args[1] || 'strategy_options') as StageId

    console.log(`\n=== DB patch — Hebrew cleanup ===`)
    console.log(`instance: ${instanceId} | stage: ${stageId}\n`)

    const [inst] = await db.select().from(instances).where(eq(instances.id, instanceId))
    if (!inst) {
        console.error(`Instance not found: ${instanceId}`)
        process.exit(1)
    }

    const rd = (inst.researchData as ResearchDataV2 | null) || {}
    const stageResult = rd.results?.[stageId] as { content?: string; records?: unknown[] } | undefined
    if (!stageResult) {
        console.error(`Stage not present in research_data.results: ${stageId}`)
        process.exit(1)
    }
    const originalContent = stageResult.content || ''
    const originalRecords = stageResult.records || []
    if (!originalContent && originalRecords.length === 0) {
        console.error(`Stage has no content/records to clean: ${stageId}`)
        process.exit(1)
    }
    console.log(`BEFORE: content ${originalContent.length} chars, records ${originalRecords.length}`)

    const result = await runHebrewCleanup({
        content: originalContent,
        records: originalRecords,
        instanceId,
        stageId,
    })

    if (!result.applied) {
        console.error(`Cleanup did not apply (skipped). Aborting — DB unchanged.`)
        process.exit(1)
    }

    console.log(`AFTER:  content ${result.cleanedContent.length} chars, records ${result.cleanedRecords?.length ?? 0}`)
    console.log(`tokens: ${result.inputTokensApprox} input → ${result.outputTokensApprox} output\n`)

    // Persist via two jsonb_set calls — content + records under
    // research_data.results.<stageId>.{content, records}
    console.log(`Updating DB...`)
    await db.execute(sql`
        UPDATE instances
        SET research_data = jsonb_set(
            jsonb_set(
                research_data,
                ${'{results,' + stageId + ',content}'}::text[],
                ${JSON.stringify(result.cleanedContent)}::jsonb
            ),
            ${'{results,' + stageId + ',records}'}::text[],
            ${JSON.stringify(result.cleanedRecords ?? originalRecords)}::jsonb
        )
        WHERE id = ${instanceId}
    `)
    console.log(`✓ DB updated.`)

    process.exit(0)
}

main().catch((err) => {
    console.error('Patch failed:', err)
    process.exit(1)
})