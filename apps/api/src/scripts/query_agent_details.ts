
import { db } from '../db'
import { agents } from '../db/schema'
import { eq } from 'drizzle-orm'
import { decrypt } from '../lib/encryption'

async function main() {
  const agentId = '64f42195-1ee1-4184-9ae8-bf9c97c145f4'
  const [agent] = await db.select().from(agents).where(eq(agents.id, agentId)).limit(1)
  if (!agent) {
    console.log('Agent ' + agentId + ' not found in DB')
    return
  }

  const rootPassword = agent.rootPassword ? decrypt(agent.rootPassword) : null
  console.log('Agent Details:')
  console.log('ID:', agent.id)
  console.log('Name:', agent.name)
  console.log('Agent Type:', agent.agentType)
  console.log('Status:', agent.status)
  console.log('IP:', agent.ip)
  console.log('Provider Server ID:', agent.providerServerId)
  console.log('Decrypted Root Password:', rootPassword)
}

main().catch(console.error)
