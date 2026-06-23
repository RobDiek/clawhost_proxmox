
import { db } from '../db'
import { agents } from '../db/schema'
import proxmox from '../services/proxmox'

// We will import callPVE or define a small helper to query the Proxmox API directly
// Since callPVE is not exported from proxmox.ts, we can implement it here or read the node env
const getEnv = (key: string, defaultVal = ''): string => {
    return process.env[key] || defaultVal
}

const callPVE = async <T>(
    method: string,
    path: string,
    body?: Record<string, unknown>
): Promise<T> => {
    const url = `${getEnv('PROXMOX_URL').replace(/\/$/, '')}/api2/json${path}`
    const tokenId = getEnv('PROXMOX_TOKEN_ID')
    const tokenSecret = getEnv('PROXMOX_TOKEN_SECRET')

    const headers: Record<string, string> = {
        'Authorization': `PVEAPIToken=${tokenId}=${tokenSecret}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
    }

    if (process.env.NODE_TLS_REJECT_UNAUTHORIZED !== '0') {
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
    }

    const res = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined
    })

    if (!res.ok) {
        const errorText = await res.text()
        throw new Error(`Proxmox API Error (${res.status} ${res.statusText}): ${errorText}`)
    }

    const data = (await res.json()) as { data: T }
    return data.data
}

async function main() {
  const node = getEnv('PROXMOX_NODE', 'pve')
  
  console.log('--- VM 9000 Config ---')
  try {
    const config = await callPVE('GET', `/nodes/${node}/qemu/9000/config`)
    console.log(config)
  } catch (err: any) {
    console.error('Failed to get VM 9000 config:', err.message)
  }

  console.log('\n--- VM 103 Config ---')
  try {
    const config = await callPVE('GET', `/nodes/${node}/qemu/103/config`)
    console.log(config)
  } catch (err: any) {
    console.error('Failed to get VM 103 config:', err.message)
  }
}

main().catch(console.error)
