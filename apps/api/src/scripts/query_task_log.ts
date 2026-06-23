
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
  // We will get the list of recent tasks to find the resize tasks
  console.log('Retrieving tasks...')
  const tasks = await callPVE<any[]>('GET', `/nodes/${node}/tasks`)
  const resizeTasks = tasks.filter(t => t.vmid === 103 && t.type === 'resize').slice(0, 5)
  
  for (const t of resizeTasks) {
    console.log(`\nTask: ${t.upid} | Status: ${t.status} | ExitStatus: ${t.exitstatus}`)
    try {
      const logs = await callPVE<any[]>('GET', `/nodes/${node}/tasks/${encodeURIComponent(t.upid)}/log`)
      console.log('Logs:')
      console.log(logs.map(l => l.t).join('\n'))
    } catch (err: any) {
      console.error('Failed to get log for task:', err.message)
    }
  }
}

main().catch(console.error)
