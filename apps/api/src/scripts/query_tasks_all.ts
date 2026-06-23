
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
  console.log('Retrieving tasks for node:', node)
  const tasks = await callPVE<any[]>('GET', `/nodes/${node}/tasks`)
  console.log('Total tasks retrieved:', tasks.length)
  console.log('Recent 10 tasks:', tasks.slice(0, 10).map(t => ({ upid: t.upid, node: t.node, type: t.type, status: t.status, vmid: t.id || t.vmid })))
}

main().catch(console.error)
