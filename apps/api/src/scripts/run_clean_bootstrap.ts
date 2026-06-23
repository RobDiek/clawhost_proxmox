
import { db } from '../db'
import { agents } from '../db/schema'
import { eq } from 'drizzle-orm'
import { decrypt } from '../lib/encryption'
import { Client } from 'ssh2'
import fs from 'fs'
import path from 'path'
import { generateProxmoxBashScript } from '../services/proxmox'

async function main() {
  const all = await db.select().from(agents).where(eq(agents.agentType, 'hermes')).limit(1)
  const agent = all[0]
  if (!agent) {
    console.error('Hermes agent not found')
    process.exit(1)
  }

  const rootPassword = agent.rootPassword ? decrypt(agent.rootPassword) : null
  const gatewayToken = agent.gatewayToken ? decrypt(agent.gatewayToken) : 'default-token'
  
  if (!rootPassword || !agent.ip) {
    console.error('Credentials or IP missing')
    process.exit(1)
  }

  // Generate the actual bootstrap script using our updated JS code
  // SelectedAgentType is 'hermes'
  const domain = 'agents.clawnode.de'
  const bashScript = generateProxmoxBashScript(
    rootPassword,
    agent.subdomain || 'agent',
    domain,
    gatewayToken,
    'hermes'
  )

  const keysDir = '/opt/clawhost/apps/api/keys'
  const privateKey = fs.readFileSync(path.join(keysDir, 'id_rsa_claw'), 'utf8')

  console.log('Connecting to VM at ' + agent.ip + '...')
  const vmConn = new Client()
  vmConn.on('ready', () => {
    console.log('Connected to Hermes VM. Writing bootstrap.sh via SFTP...')
    
    vmConn.sftp((err, sftp) => {
      if (err) throw err
      
      const wStream = sftp.createWriteStream('/tmp/bootstrap.sh')
      wStream.write(bashScript)
      wStream.end()
      
      wStream.on('close', () => {
        console.log('bootstrap.sh written. Executing bootstrap script as root...')
        
        vmConn.exec('sudo bash /tmp/bootstrap.sh', (execErr, stream) => {
          if (execErr) throw execErr
          
          stream.on('data', (d) => process.stdout.write(d.toString()))
          stream.stderr.on('data', (d) => process.stderr.write('ERR: ' + d.toString()))
          stream.on('close', () => {
            console.log('Bootstrap execution finished.')
            vmConn.end()
          })
        })
      })
    })
  }).on('error', (err) => {
    console.error('SSH connection failed:', err)
  }).connect({
    host: agent.ip,
    port: 22,
    username: 'ubuntu',
    privateKey: privateKey
  })
}

main().catch(console.error)
