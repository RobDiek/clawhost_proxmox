import type { HonoEnv } from '@/ts/Types'

import { Hono } from 'hono'
import {
    getClaws,
    getAdminClaws,
    getClaw,
    initiateClawPurchase,
    syncClaw,
    startClaw,
    stopClaw,
    restartClaw,
    deleteClaw,
    cancelDeletion,
    hardDeleteClaw,
    getClawDiagnostics,
    getClawLogs,
    repairClaw,
    listClawFiles,
    readClawFile,
    updateClawFile,
    reinstallClaw,
    exportClaw,
    getClawVersion,
    getClawVersions,
    installClawVersion,
    renameClaw,
    getClawCredentials,
    cancelPendingClaw,
    updateClawSubdomain,
    checkSubdomainAvailability
} from '@/controllers/claws'
import adminOnly from '@/middleware/adminOnly'

const app = new Hono<HonoEnv>()

app.get('/', getClaws)
app.get('/admin', adminOnly, getAdminClaws)
app.get('/check-subdomain', checkSubdomainAvailability)
app.get('/:id', getClaw)
app.post('/purchase', initiateClawPurchase)
app.delete('/pending/:id', cancelPendingClaw)
app.post('/:id/sync', syncClaw)
app.post('/:id/start', startClaw)
app.post('/:id/stop', stopClaw)
app.post('/:id/restart', restartClaw)
app.post('/:id/cancel-deletion', cancelDeletion)
app.post('/:id/hard-delete', adminOnly, hardDeleteClaw)
app.post('/:id/diagnostics/status', getClawDiagnostics)
app.post('/:id/diagnostics/logs', getClawLogs)
app.post('/:id/diagnostics/repair', adminOnly, repairClaw)
app.post('/:id/reinstall', reinstallClaw)
app.get('/:id/export', exportClaw)
app.post('/:id/files', listClawFiles)
app.post('/:id/files/read', readClawFile)
app.put('/:id/files', updateClawFile)
app.post('/:id/version', getClawVersion)
app.post('/:id/versions', getClawVersions)
app.post('/:id/install-version', adminOnly, installClawVersion)
app.get('/:id/credentials', getClawCredentials)
app.patch('/:id/subdomain', updateClawSubdomain)
app.patch('/:id', renameClaw)
app.delete('/:id', deleteClaw)

export default app