import { ipcMain } from 'electron'
import { agentProvider } from '@openclaw/shared'
import { t } from '@openclaw/i18n'
import { configStore } from '@/main/services'

const registerStubHandlers = (): void => {
    ipcMain.handle('getPlans', () => {
        return {
            plans: [
                {
                    id: agentProvider.local,
                    name: 'Local',
                    cpu: 0,
                    memory: 0,
                    disk: 0,
                    priceMonthly: 0,
                    architecture: process.arch
                }
            ],
            atCapacity: false
        }
    })

    ipcMain.handle('getLocations', () => {
        return [
            {
                id: agentProvider.local,
                name: 'Local',
                city: 'Local',
                country: 'Local',
                disabled: false
            }
        ]
    })

    ipcMain.handle('getVolumePricing', () => {
        return { pricePerGbMonthly: 0, minSize: 0, maxSize: 0 }
    })

    ipcMain.handle('getPlanAvailability', () => {
        return []
    })

    ipcMain.handle('getSSHKeys', () => {
        return []
    })

    ipcMain.handle('createSSHKey', () => {
        return {}
    })

    ipcMain.handle('deleteSSHKey', () => {
        return { success: true }
    })

    ipcMain.handle('purchaseAgent', () => {
        throw new Error(t('go.purchasingNotAvailable'))
    })

    ipcMain.handle('getAdminAgents', () => {
        const config = configStore.readConfig()
        return config.agents
    })
}

export default registerStubHandlers