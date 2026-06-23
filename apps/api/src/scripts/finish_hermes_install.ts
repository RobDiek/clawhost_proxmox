
import { db } from '../db'
import { agents } from '../db/schema'
import { eq } from 'drizzle-orm'
import { decrypt } from '../lib/encryption'
import { Client } from 'ssh2'
import fs from 'fs'
import path from 'path'

async function main() {
  const all = await db.select().from(agents).where(eq(agents.agentType, 'hermes')).limit(1)
  const agent = all[0]
  if (!agent) {
    console.error('Hermes agent not found')
    process.exit(1)
  }

  const rootPassword = agent.rootPassword ? decrypt(agent.rootPassword) : null
  if (!rootPassword || !agent.ip) {
    console.error('Credentials or IP missing')
    process.exit(1)
  }

  const keysDir = '/opt/clawhost/apps/api/keys'
  const privateKey = fs.readFileSync(path.join(keysDir, 'id_rsa_claw'), 'utf8')

  const vmConn = new Client()
  vmConn.on('ready', () => {
    console.log('Connected to Hermes VM. Executing remaining bootstrap steps manually...')
    
    const cmd = [
      'sudo passwd -u root || true',
      'echo "root:' + rootPassword + '" | sudo chpasswd',
      'sudo sed -i "s/^#*PermitRootLogin.*/PermitRootLogin yes/" /etc/ssh/sshd_config',
      'sudo sed -i "s/^#*PasswordAuthentication.*/PasswordAuthentication yes/" /etc/ssh/sshd_config',
      'sudo printf "PermitRootLogin yes\\nPasswordAuthentication yes\\n" > /tmp/01-clawhost.conf',
      'sudo mv /tmp/01-clawhost.conf /etc/ssh/sshd_config.d/01-clawhost.conf',
      'sudo systemctl reload ssh || sudo systemctl reload sshd || true',
      'sudo useradd -m -d /home/hermes -s /bin/bash hermes || true',
      'echo "hermes ALL=(ALL) NOPASSWD:ALL" | sudo tee /etc/sudoers.d/hermes',
      'sudo chmod 0440 /etc/sudoers.d/hermes',
      'sudo apt-get update && sudo apt-get install -y build-essential python3-dev libffi-dev ripgrep ffmpeg',
      'sudo tee /etc/systemd/system/hermes-gateway.service << "SYSTEMD"\n[Unit]\nDescription=Hermes Gateway\nAfter=network.target\n\n[Service]\nType=simple\nUser=hermes\nGroup=hermes\nWorkingDirectory=/home/hermes\nEnvironment=HOME=/home/hermes\nEnvironment=PATH=/home/hermes/.local/bin:/usr/local/bin:/usr/bin:/bin\nExecStart=/home/hermes/.local/bin/hermes gateway run --replace\nRestart=on-failure\nRestartSec=10\nStandardOutput=append:/var/log/hermes-gateway.log\nStandardError=append:/var/log/hermes-gateway.log\n\n[Install]\nWantedBy=multi-user.target\nSYSTEMD',
      'sudo touch /var/log/hermes-gateway.log /var/log/hermes-install.log',
      'sudo chown hermes:hermes /var/log/hermes-gateway.log /var/log/hermes-install.log',
      'sudo systemctl daemon-reload',
      'sudo ufw allow 22/tcp',
      'sudo ufw allow 80/tcp',
      'sudo ufw allow 443/tcp',
      'sudo ufw --force enable',
      'sudo nohup bash -c \'su - hermes -c "curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh | bash -s -- --skip-setup" >> /var/log/hermes-install.log 2>&1 && if su - hermes -c "command -v hermes >/dev/null 2>&1 && hermes --version >/dev/null 2>&1"; then echo "hermes-install: success" >> /var/log/hermes-install.log; systemctl enable hermes-gateway; systemctl start hermes-gateway; else echo "hermes-install: FAILED" >> /var/log/hermes-install.log; fi\' > /dev/null 2>&1 &'
    ].join(' && ')

    vmConn.exec(cmd, (err, stream) => {
      if (err) throw err
      stream.on('data', (d) => process.stdout.write(d.toString()))
      stream.stderr.on('data', (d) => process.stderr.write('ERR: ' + d.toString()))
      stream.on('close', () => {
        console.log('Manually executed bootstrap steps.')
        vmConn.end()
      })
    })
  }).on('error', (err) => {
    console.error('SSH connection failed:', err)
  }).connect({
    host: agent.ip,
    port: 22,
    username: 'ubuntu',
    privateKey: privateKey
  })
}

main().catch(console.error)
