
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
  const upid = 'UPID:DiekDataCenter1:003C70CF:010C0995:6A25D380:resize:103:root@pam!clawhost:'
  
  console.log('Retrieving logs for task:', upid)
  const logs = await callPVE<any[]>('GET', `/nodes/${node}/tasks/${encodeURIComponent(upid)}/log`)
  console.log(logs.map(l => l.t).join('\n'))
}

main().catch(console.error)
