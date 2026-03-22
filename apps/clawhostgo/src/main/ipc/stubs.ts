import { ipcMain } from 'electron'
import { clawProvider } from '@openclaw/shared'
import { t } from '@openclaw/i18n'
import { configStore } from '@/main/services'

const registerStubHandlers = (): void => {
    ipcMain.handle('getPlans', () => {
        return {
            plans: [
                {
                    id: clawProvider.local,
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
                id: clawProvider.local,
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

    ipcMain.handle('purchaseClaw', () => {
        throw new Error(t('go.purchasingNotAvailable'))
    })

    ipcMain.handle('getAdminClaws', () => {
        const config = configStore.readConfig()
        return config.claws
    })

    ipcMain.handle('pairWhatsApp', () => {
        return { qrCode: null, status: 'unavailable' }
    })

    ipcMain.handle('pairWhatsAppStatus', () => {
        return { status: 'unavailable' }
    })
}

export default registerStubHandlers