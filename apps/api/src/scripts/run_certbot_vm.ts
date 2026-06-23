
import { db } from '../db'
import { agents } from '../db/schema'
import { eq } from 'drizzle-orm'
import { decrypt } from '../lib/encryption'
import { Client } from 'ssh2'

async function main() {
  const all = await db.select().from(agents).where(eq(agents.subdomain, 'zbzcuf3z')).limit(1)
  const agent = all[0]
  if (!agent) {
    console.error('Agent not found')
    process.exit(1)
  }
  
  const rootPassword = agent.rootPassword ? decrypt(agent.rootPassword) : null
  if (!rootPassword || !agent.ip) {
    console.error('Credentials missing')
    process.exit(1)
  }

  const vmConn = new Client()
  vmConn.on('ready', () => {
    console.log('Connected to VM via SSH. Running certbot...')
    vmConn.exec('certbot --nginx -d zbzcuf3z.agents.clawnode.de --non-interactive --agree-tos --email ssl@agents.clawnode.de --redirect', (err, stream) => {
      if (err) throw err
      stream.on('data', (d) => process.stdout.write(d.toString()))
      stream.stderr.on('data', (d) => process.stderr.write('ERR: ' + d.toString()))
      stream.on('close', () => {
        console.log('Certbot command completed.')
        vmConn.end()
      })
    })
  }).on('error', (err) => {
    console.error('SSH to VM failed:', err)
  }).connect({
    host: agent.ip,
    port: 22,
    username: 'root',
    password: rootPassword
  })
}

main().catch(console.error)
