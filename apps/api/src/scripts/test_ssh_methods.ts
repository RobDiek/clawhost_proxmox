
import { db } from '../db'
import { agents } from '../db/schema'
import { eq } from 'drizzle-orm'
import { decrypt } from '../lib/encryption'
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

  const rootPassword = agent.rootPassword ? decrypt(agent.rootPassword) : null
  console.log('Agent:', agent.name, 'IP:', agent.ip)
  console.log('Decrypted root password:', rootPassword)

  const keysDir = '/opt/clawhost/apps/api/keys'
  let privateKey: string | null = null
  try {
    if (fs.existsSync(path.join(keysDir, 'id_rsa_claw'))) {
      privateKey = fs.readFileSync(path.join(keysDir, 'id_rsa_claw'), 'utf8')
      console.log('Master SSH Key found!')
    } else {
      console.log('Master SSH Key not found at:', keysDir)
    }
  } catch (err) {
    console.error('Error reading master key:', err)
  }

  // Attempt SSH as root using password
  if (rootPassword) {
    console.log('Attempting SSH as root with password...')
    const conn = new Client()
    const success = await new Promise((resolve) => {
      conn.on('ready', () => {
        console.log('SSH as root with password SUCCESSFUL!')
        conn.end()
        resolve(true)
      }).on('error', (err) => {
        console.log('SSH as root with password FAILED:', err.message)
        resolve(false)
      }).connect({
        host: agent.ip,
        port: 22,
        username: 'root',
        password: rootPassword,
        readyTimeout: 5000
      })
    })
  }

  // Attempt SSH as ubuntu (or provider user) using master key
  if (privateKey) {
    console.log('Attempting SSH as ubuntu with master key...')
    const conn = new Client()
    const success = await new Promise((resolve) => {
      conn.on('ready', () => {
        console.log('SSH as ubuntu with master key SUCCESSFUL!')
        conn.end()
        resolve(true)
      }).on('error', (err) => {
        console.log('SSH as ubuntu with master key FAILED:', err.message)
        resolve(false)
      }).connect({
        host: agent.ip,
        port: 22,
        username: 'ubuntu',
        privateKey: privateKey,
        readyTimeout: 5000
      })
    })
  }
}

main().catch(console.error)
