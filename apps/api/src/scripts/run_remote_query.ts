
import { db } from '../db'
import { agents } from '../db/schema'
import { desc } from 'drizzle-orm'
import { decrypt } from '../lib/encryption'

async function main() {
  console.log('=== Checking Agents in Database ===')
  const allAgents = await db.select().from(agents).orderBy(desc(agents.createdAt))
  console.log('Total agents found:', allAgents.length)
  
  for (const agent of allAgents) {
    const rootPass = agent.rootPassword ? decrypt(agent.rootPassword) : 'none'
    console.log('- ID:', agent.id, '\n  Name:', agent.name, '\n  Type:', agent.agentType, '\n  Status:', agent.status, '\n  IP:', agent.ip, '\n  Subdomain:', agent.subdomain, '\n  Created:', agent.createdAt, '\n  Password:', rootPass)
  }
}

main().catch(console.error)
