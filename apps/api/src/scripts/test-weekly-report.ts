import { buildWeeklyReport } from '@/services/reportBuilder'
async function main() {
    const instanceId = process.argv[2] || '44f484a852'
    const agentId = process.argv[3] || 'mta_Un9jXRuf'
    const start = process.argv[4] || '2026-05-26'
    const end = process.argv[5] || '2026-06-01'
    const r = await buildWeeklyReport(instanceId, agentId, { start, end })
    console.log('\n========= RENDERED TELEGRAM REPORT =========\n')
    console.log(r.text)
    console.log('\n============================================\n')
    process.exit(0)
}
main().catch(e => { console.error('FATAL', e); process.exit(1) })