
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

const waitTask = async (upid: string): Promise<void> => {
    const node = getEnv('PROXMOX_NODE', 'pve')
    while (true) {
        const status = await callPVE<{ status: string; exitstatus?: string }>(
            'GET',
            `/nodes/${node}/tasks/${encodeURIComponent(upid)}/status`
        )
        if (status.status === 'stopped') {
            if (status.exitstatus && status.exitstatus !== 'OK') {
                throw new Error(`Task failed: ${status.exitstatus}`)
            }
            break
        }
        await new Promise((resolve) => setTimeout(resolve, 1000))
    }
}

async function main() {
  const node = getEnv('PROXMOX_NODE', 'pve')
  console.log('Attempting to resize VM 103 disk scsi0 to 80G...')
  try {
    const resizeUpid = await callPVE('PUT', `/nodes/${node}/qemu/103/resize`, {
      disk: 'scsi0',
      size: '80G'
    })
    console.log('Resize task started. UPID:', resizeUpid)
    await waitTask(resizeUpid)
    console.log('Resize task completed successfully!')
  } catch (err: any) {
    console.error('Resize failed:', err.message)
  }
}

main().catch(console.error)
