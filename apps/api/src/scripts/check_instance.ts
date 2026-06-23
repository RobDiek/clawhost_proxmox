
import { db } from '../db'
import { agents } from '../db/schema'
import { eq } from 'drizzle-orm'
import { decrypt } from '../lib/encryption'
import { Client } from 'ssh2'

async function main() {
  const all = await db.select().from(agents).where(eq(agents.subdomain, 'zbzcuf3z')).limit(1)
  const agent = all[0]
  if (!agent) {
    console.error('Agent zbzcuf3z not found in database')
    process.exit(1)
  }

  console.log('Agent found:', agent.name, 'IP:', agent.ip)
  const rootPassword = agent.rootPassword ? decrypt(agent.rootPassword) : null
  console.log('Decrypted root password:', rootPassword)

  if (!agent.ip) {
    console.error('No IP for agent')
    process.exit(1)
  }

  for (const port of [22, 80, 443, 18789]) {
    try {
      await new Promise((resolve, reject) => {
        const s = require('net').createConnection(port, agent.ip, () => {
          s.end()
          resolve(true)
        })
        s.on('error', reject)
        setTimeout(() => { s.destroy(); reject(new Error('timeout')) }, 2000)
      })
      console.log('Port ' + port + ' is OPEN')
    } catch (err: any) {
      console.log('Port ' + port + ' is CLOSED (' + err.message + ')')
    }
  }

  if (rootPassword) {
    console.log('Connecting via SSH to check openclaw status...')
    const conn = new Client()
    conn.on('ready', () => {
      conn.exec('systemctl status openclaw-gateway || systemctl status hermes-gateway; echo "--- NETWORK ---"; ss -tlnp', (err, stream) => {
        if (err) throw err
        stream.on('data', (d) => process.stdout.write(d.toString()))
        stream.stderr.on('data', (d) => process.stderr.write('ERR: ' + d.toString()))
        stream.on('close', () => conn.end())
      })
    }).on('error', (err) => {
      console.error('SSH connection error to VM:', err)
    }).connect({
      host: agent.ip,
      port: 22,
      username: 'root',
      password: rootPassword,
      readyTimeout: 10000
    })
  }
}

main().catch(console.error)
