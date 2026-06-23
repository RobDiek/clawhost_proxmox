
import { Client } from 'ssh2'
import fs from 'fs'
import path from 'path'

async function main() {
  const ip = '45.84.197.129'
  const keysDir = '/opt/clawhost/apps/api/keys'
  const privateKey = fs.readFileSync(path.join(keysDir, 'id_rsa_claw'), 'utf8')

  console.log('Connecting to hermes VM to test --branch checkout...')
  const conn = new Client()
  
  await new Promise((resolve) => {
    conn.on('ready', () => {
      console.log('Connected! Running install script with --branch v0.15.0...')
      
      const commands = [
        'sudo -u hermes -i curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh | sudo -u hermes -i bash -s -- --skip-setup',
        'echo "=== CHECKOUT TAG ==="',
        'sudo -u hermes -i bash -c "cd /home/hermes/.hermes/hermes-agent && git fetch --tags && git checkout v2026.5.29"',
        'echo "=== CHECKING INSTALLED VERSION ==="',
        'sudo -u hermes -i hermes --version'
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
