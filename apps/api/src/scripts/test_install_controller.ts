
import installAgentVersion from '../controllers/agents/installAgentVersion'

async function main() {
  const c: any = {
    req: {
      param: (name: string) => '64f42195-1ee1-4184-9ae8-bf9c97c145f4',
      json: async () => ({ version: 'v0.0.289' })
    },
    get: (key: string) => {
      if (key === 'userId') return 'some-user'
      if (key === 'isAdmin') return true
      return null
    },
    json: (body: any, code: number) => {
      console.log('\n=== CONTROLLER RESPONSE ===')
      console.log('CODE:', code)
      console.log(JSON.stringify(body, null, 2))
      return body
    }
  }

  console.log('Calling installAgentVersion controller directly on the server...')
  await installAgentVersion(c)
}

main().catch(console.error)
