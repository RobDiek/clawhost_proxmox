
import { db } from '../db'
import { agents } from '../db/schema'
import { Client } from 'ssh2'

async function main() {
  const allAgents = await db.select().from(agents)
  console.log('All agents in DB:')
  for (const agent of allAgents) {
    console.log('- Name:', agent.name, 'Type:', agent.agentType, 'IP:', agent.ip, 'Status:', agent.status)
  }

  // Find any Hermes agent (or the most recent one)
  const hermesAgents = allAgents.filter(a => a.agentType === 'hermes')
  if (hermesAgents.length === 0) {
    console.log('No Hermes agents found.')
    process.exit(0)
  }

  const agent = hermesAgents[hermesAgents.length - 1] // most recent
  console.log('\nChecking recent Hermes agent:', agent.name, 'IP:', agent.ip)
  
  const rootPassword = agent.rootPassword ? decrypt(agent.rootPassword) : null
  if (!rootPassword || !agent.ip) {
    console.error('Credentials/IP missing for agent')
    process.exit(1)
  }

  const vmConn = new Client()
  vmConn.on('ready', () => {
    console.log('Connected to Hermes VM via SSH. Inspecting /var/log/hermes-install.log...')
    vmConn.exec('tail -n 50 /var/log/hermes-install.log', (err, stream) => {
      if (err) throw err
      stream.on('data', (d) => process.stdout.write(d.toString()))
      stream.stderr.on('data', (d) => process.stderr.write('ERR: ' + d.toString()))
      stream.on('close', () => {
        console.log('\n--- check_instance status command finished ---')
        vmConn.end()
      })
    })
  }).on('error', (err) => {
    console.error('SSH to VM failed:', err)
  }).connect({
    host: agent.ip,
    port: 22,
    username: 'root',
    password: rootPassword,
    readyTimeout: 10000
  })
}

import { decrypt } from '../lib/encryption'
main().catch(console.error)
