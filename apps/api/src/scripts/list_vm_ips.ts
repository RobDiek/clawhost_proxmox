const getEnv = (key: string, defaultVal = ''): string => {
    return process.env[key] || defaultVal
}

const callPVE = async <T>(method: string, path: string): Promise<T> => {
    const url = `${getEnv('PROXMOX_URL').replace(/\/$/, '')}/api2/json${path}`
    const tokenId = getEnv('PROXMOX_TOKEN_ID')
    const tokenSecret = getEnv('PROXMOX_TOKEN_SECRET')

    const headers: Record<string, string> = {
        'Authorization': `PVEAPIToken=${tokenId}=${tokenSecret}`,
        'Accept': 'application/json'
    }

    if (process.env.NODE_TLS_REJECT_UNAUTHORIZED !== '0') {
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
    }

    const res = await fetch(url, { method, headers })
    const data = await res.json() as { data: T }
    return data.data
}

async function run() {
    const node = getEnv('PROXMOX_NODE', 'DiekDataCenter1')
    console.log("Querying template VM 9001 config...")
    try {
        const config = await callPVE<Record<string, unknown>>('GET', `/nodes/${node}/qemu/9001/config`)
        console.log("Template VM 9001 Config:", config)
    } catch (err: unknown) {
        console.error("Failed to read template config:", (err as Error).message)
    }
}

run().catch(console.error)