/**
 * Proxmox Provider Adapter
 * Wraps your existing Proxmox service to conform to the CloudProvider interface
 * Allows synex architecture (provisioner.ts, getProvider.ts) to work with Proxmox backend
 * 
 * This file imports and re-exports your proven Proxmox implementation
 * Zero changes needed to existing proxmox.ts
 */

import type { CloudProvider } from '@/ts/Interfaces'
import proxmoxService from '@/services/proxmox'

/**
 * Proxmox provider - directly delegates to existing proxmox.ts service
 * All methods already exist and are fully functional
 */
const proxmoxProvider: CloudProvider = {
    // Server management
    createServer: (name, serverType, location, rootPassword, sshKeyIds, snapshotId, userData) =>
        proxmoxService.createServer(name, serverType, location, rootPassword, sshKeyIds, snapshotId, userData),
    
    getServer: (serverId) =>
        proxmoxService.getServer(serverId),
    
    getServers: () =>
        proxmoxService.getServers(),
    
    startServer: (serverId) =>
        proxmoxService.startServer(serverId),
    
    stopServer: (serverId) =>
        proxmoxService.stopServer(serverId),
    
    restartServer: (serverId) =>
        proxmoxService.restartServer(serverId),
    
    deleteServer: (serverId) =>
        proxmoxService.deleteServer(serverId),
    
    // Server type and location info
    getServerTypes: () =>
        proxmoxService.getServerTypes(),
    
    getLocations: () =>
        proxmoxService.getLocations(),
    
    getRawServerTypes: () =>
        proxmoxService.getRawServerTypes(),
    
    getDatacenters: () =>
        proxmoxService.getDatacenters(),
    
    // SSH Key management
    createSSHKey: (name, publicKey) =>
        proxmoxService.createSSHKey(name, publicKey),
    
    deleteSSHKey: (keyId) =>
        proxmoxService.deleteSSHKey(keyId),
    
    // Volume management
    getVolumePricing: () =>
        proxmoxService.getVolumePricing(),
    
    createVolume: (name, size, location, serverId) =>
        proxmoxService.createVolume(name, size, location, serverId),
    
    attachVolume: (volumeId, serverId) =>
        proxmoxService.attachVolume(volumeId, serverId),
    
    detachVolume: (volumeId) =>
        proxmoxService.detachVolume(volumeId),
    
    deleteVolume: (volumeId) =>
        proxmoxService.deleteVolume(volumeId),
    
    getVolume: (volumeId) =>
        proxmoxService.getVolume(volumeId),
    
    getVolumes: (serverId) =>
        proxmoxService.getVolumes?.(serverId),
    
    changeServerType: (serverId, newType) =>
        proxmoxService.changeServerType?.(serverId, newType)
}

export default proxmoxProvider
