import proxmox from '@/services/proxmox'
import generateCloudInit from '@/controllers/agents/helpers/generateCloudInit'

async function run() {
    console.log("Starting VM deployment process on Proxmox...")
    const password = "Welc0meDiekClaw!"
    const subdomain = "test-openclaw"
    const domain = "localhost"
    const gatewayToken = "my-secure-gateway-token-123"
    
    console.log("Generating cloud-init user-data...")
    const cloudInit = generateCloudInit(
        password,
        subdomain,
        domain,
        gatewayToken,
        'openclaw'
    )
    
    console.log("Creating VM on Proxmox (cloning template, uploading snippet, configuring, starting)...")
    const result = await proxmox.createServer(
        "test-openclaw-agent",
        "cx23",
        "proxmox",
        password,
        [],
        undefined,
        cloudInit
    )
    
    console.log("\nDeployment complete!")
    console.log("VM ID (Server ID):", result.serverId)
    console.log("Resolved IP:", result.ip)
    console.log("Root Password:", result.rootPassword)
    console.log(`Connection test command: ssh root@${result.ip}`)
}

run().catch((err) => {
    console.error("Deployment failed:", err)
})