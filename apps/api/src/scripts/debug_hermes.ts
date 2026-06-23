
import { Client } from 'ssh2'
import fs from 'fs'
import path from 'path'

async function main() {
  const ip = '45.84.197.129'
  const keysDir = '/opt/clawhost/apps/api/keys'
  const privateKey = fs.readFileSync(path.join(keysDir, 'id_rsa_claw'), 'utf8')

  console.log('Connecting to hermes VM at ' + ip + ' using master key...')
  const conn = new Client()
  
  await new Promise((resolve) => {
    conn.on('ready', () => {
      console.log('SSH connection successful! Fetching hermes logs...')
      
      const commands = [
        'echo "=== HERMES VERSION ==="',
        'sudo -u hermes -i hermes --version || echo "Hermes not found or error"',
        'echo "=== HERMES INSTALL LOG TAIL ==="',
        'sudo tail -n 100 /var/log/hermes-install.log || echo "No install log found"',
        'echo "=== HERMES GATEWAY LOG TAIL ==="',
        'sudo tail -n 100 /var/log/hermes-gateway.log || echo "No gateway log found"',
        'echo "=== SYSTEMD STATUS ==="',
        'sudo systemctl status hermes-gateway || true',
        'echo "=== TESTING HERMES INSTALL COMMAND ==="',
        'sudo -u hermes -i curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh | sudo -u hermes -i bash -s -- --skip-setup || true'
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
