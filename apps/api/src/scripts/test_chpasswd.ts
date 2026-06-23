
import { db } from '../db'
import { agents } from '../db/schema'
import { eq } from 'drizzle-orm'
import { Client } from 'ssh2'
import fs from 'fs'
import path from 'path'

async function main() {
  const all = await db.select().from(agents).where(eq(agents.agentType, 'hermes')).limit(1)
  const agent = all[0]
  if (!agent) {
    console.error('Hermes agent not found')
    process.exit(1)
  }

  const keysDir = '/opt/clawhost/apps/api/keys'
  const privateKey = fs.readFileSync(path.join(keysDir, 'id_rsa_claw'), 'utf8')

  const vmConn = new Client()
  vmConn.on('ready', () => {
    console.log('Connected to Hermes VM. Testing passwd -u and chpasswd...')
    
    vmConn.exec('sudo passwd -u root; echo "root:testpwd123" | sudo chpasswd; echo "STATUS: $?"', (err, stream) => {
      if (err) throw err
      stream.on('data', (d) => process.stdout.write(d.toString()))
      stream.stderr.on('data', (d) => process.stderr.write('ERR: ' + d.toString()))
      stream.on('close', () => {
        vmConn.end()
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
