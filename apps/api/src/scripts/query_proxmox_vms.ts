
import { db } from '../db'
import { agents } from '../db/schema'
import proxmox from '../services/proxmox'

async function main() {
  const allAgents = await db.select().from(agents)
  console.log('Agents in DB:', allAgents.map(a => ({ id: a.id, name: a.name, planId: a.planId, providerServerId: a.providerServerId })))

  try {
    const list = await proxmox.getServers()
    console.log('Proxmox servers list:', Array.from(list.entries()))
  } catch (err) {
    console.error('Failed to get servers:', err)
  }
}

main().catch(console.error)
