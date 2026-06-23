
import { Client } from 'ssh2'
import fs from 'fs'
import path from 'path'

async function main() {
  const ip = '45.84.197.129'
  const keysDir = '/opt/clawhost/apps/api/keys'
  const privateKey = fs.readFileSync(path.join(keysDir, 'id_rsa_claw'), 'utf8')

  console.log('Connecting to hermes VM to inspect install.sh...')
  const conn = new Client()
  
  await new Promise((resolve) => {
    conn.on('ready', () => {
      console.log('Connected! Grepping install.sh for checkout/branch logic...')
      
      const commands = [
        'sudo -u hermes -i grep -n -C 10 -i "checkout" /home/hermes/.hermes/hermes-agent/scripts/install.sh || echo "Not found"',
        'sudo -u hermes -i grep -n -C 10 -i "branch" /home/hermes/.hermes/hermes-agent/scripts/install.sh || echo "Not found"'
      ].join(' && ')

      conn.exec(commands, (err, stream) => {
        if (err) throw err
        stream.on('data', (d) => process.stdout.write(d.toString()))
        stream.stderr.on('data', (d) => process.stderr.write('ERR: ' + d.toString()))
        stream.on('close', () => {
          conn.end()
          resolve(true)
        })
      })
    }).on('error', (err) => {
      console.error('SSH connection failed:', err.message)
      resolve(false)
    }).connect({
      host: ip,
      port: 22,
      username: 'ubuntu',
      privateKey: privateKey,
      readyTimeout: 10000
    })
  })
}

main().catch(console.error)
