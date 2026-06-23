
import { db } from '../db'
import { agents } from '../db/schema'
import { decrypt } from '../lib/encryption'
import { Client } from 'ssh2'
import fs from 'fs'
import path from 'path'

async function main() {
  const allAgents = await db.select().from(agents)
  console.log('Found ' + allAgents.length + ' agents in database.')

  const keysDir = '/opt/clawhost/apps/api/keys'
  let privateKey: string | null = null
  try {
    if (fs.existsSync(path.join(keysDir, 'id_rsa_claw'))) {
      privateKey = fs.readFileSync(path.join(keysDir, 'id_rsa_claw'), 'utf8')
    }
  } catch (err) {
    console.error('Error reading master key:', err)
  }

  for (const agent of allAgents) {
    const rootPassword = agent.rootPassword ? decrypt(agent.rootPassword) : null
    console.log('\n--- Testing Agent:', agent.name, '(' + agent.agentType + ') IP:', agent.ip, '---')

    if (!agent.ip) {
      console.log('No IP address for agent')
      continue
    }

    // 1. SSH as root with password
    if (rootPassword) {
      console.log('Attempting SSH as root with password...')
      const conn = new Client()
      await new Promise((resolve) => {
        conn.on('ready', () => {
          console.log('  SSH as root with password: SUCCESS')
          conn.end()
          resolve(true)
        }).on('error', (err) => {
          console.log('  SSH as root with password: FAILED (' + err.message + ')')
          resolve(false)
        }).connect({
          host: agent.ip,
          port: 22,
          username: 'root',
          password: rootPassword,
          readyTimeout: 5000
        })
      })
    } else {
      console.log('No root password for agent')
    }

    // 2. SSH as root with master key
    if (privateKey) {
      console.log('Attempting SSH as root with master key...')
      const conn = new Client()
      await new Promise((resolve) => {
        conn.on('ready', () => {
          console.log('  SSH as root with master key: SUCCESS')
          conn.end()
          resolve(true)
        }).on('error', (err) => {
          console.log('  SSH as root with master key: FAILED (' + err.message + ')')
          resolve(false)
        }).connect({
          host: agent.ip,
          port: 22,
          username: 'root',
          privateKey: privateKey,
          readyTimeout: 5000
        })
      })
    }

    // 3. SSH as ubuntu with master key
    if (privateKey) {
      console.log('Attempting SSH as ubuntu with master key...')
      const conn = new Client()
      await new Promise((resolve) => {
        conn.on('ready', () => {
          console.log('  SSH as ubuntu with master key: SUCCESS')
          conn.end()
          resolve(true)
        }).on('error', (err) => {
          console.log('  SSH as ubuntu with master key: FAILED (' + err.message + ')')
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
}

main().catch(console.error)
