
import { Client } from 'ssh2'
import fs from 'fs'
import path from 'path'

async function main() {
  const ip = '45.84.197.134'
  const rootPass = 'F1q0PoWxIDDZKDvz'
  const keysDir = '/opt/clawhost/apps/api/keys'
  const privateKey = fs.readFileSync(path.join(keysDir, 'id_rsa_claw'), 'utf8')

  console.log('Connecting to witty-cloud VM at ' + ip + ' using master key...')
  const conn = new Client()
  
  await new Promise((resolve) => {
    conn.on('ready', () => {
      console.log('SSH connection successful! Fetching bootstrap and system logs...')
      
      const commands = [
        'echo "=== BOOTSTRAP LOG TAIL ==="',
        'tail -n 100 /var/log/bootstrap.log || echo "No bootstrap log found"',
        'echo "=== OPENCLAW GATEWAY LOG TAIL ==="',
        'tail -n 100 /var/log/openclaw-gateway.log || echo "No gateway log found"',
        'echo "=== SYSTEMD OPENCLAW-GATEWAY STATUS ==="',
        'systemctl status openclaw-gateway || true',
        'echo "=== NGINX STATUS ==="',
        'systemctl status nginx || true',
        'echo "=== NGINX SITES-ENABLED ==="',
        'ls -la /etc/nginx/sites-enabled/',
        'echo "=== BOOTSTRAP LOG LAST ERROR ==="',
        'grep -i error /var/log/bootstrap.log || true'
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
