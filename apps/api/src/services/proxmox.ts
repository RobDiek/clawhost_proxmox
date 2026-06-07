import type {
    CloudProvider,
    CreateServerResult,
    ServerStatus,
    ServerTypeInfo,
    LocationInfo,
    RawServerType,
    DatacenterAvailability,
    CreateSSHKeyResult,
    VolumePricingResult,
    VolumeInfo,
    VolumeDetails
} from '@/ts/Interfaces'
import { PLANS, agentType } from '@openclaw/shared'
import applyToolsDefaults from '@/controllers/agents/helpers/applyToolsDefaults'
import { db } from '@/db'
import { agents, sshKeys } from '@/db/schema'
import { eq } from 'drizzle-orm'
import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'
import { Client } from 'ssh2'
import { sshDefaults } from '@/lib/constants'
import { inputValidation } from '@openclaw/shared'

const getEnv = (key: string, defaultVal = ''): string => {
    return process.env[key] || defaultVal
}

const getOrCreateMasterSSHKey = (): { publicKey: string; privateKey: string } => {
    if (fs.existsSync('/tmp/id_rsa_clawtest') && fs.existsSync('/tmp/id_rsa_clawtest.pub')) {
        try {
            return {
                privateKey: fs.readFileSync('/tmp/id_rsa_clawtest', 'utf8').trim(),
                publicKey: fs.readFileSync('/tmp/id_rsa_clawtest.pub', 'utf8').trim()
            }
        } catch {}
    }

    let keysDir = getEnv('MASTER_SSH_KEYS_DIR')
    if (!keysDir) {
        keysDir = path.join(process.cwd(), 'keys')
    }
    const privateKeyPath = path.join(keysDir, 'id_rsa_claw')
    const publicKeyPath = path.join(keysDir, 'id_rsa_claw.pub')

    if (fs.existsSync(privateKeyPath) && fs.existsSync(publicKeyPath)) {
        try {
            return {
                privateKey: fs.readFileSync(privateKeyPath, 'utf8').trim(),
                publicKey: fs.readFileSync(publicKeyPath, 'utf8').trim()
            }
        } catch {}
    }

    try {
        fs.mkdirSync(keysDir, { recursive: true })
        console.log('Generating master SSH key pair via ssh-keygen...')
        execSync(`ssh-keygen -t rsa -b 2048 -m PEM -N "" -f "${privateKeyPath}"`, { stdio: 'ignore' })
        return {
            privateKey: fs.readFileSync(privateKeyPath, 'utf8').trim(),
            publicKey: fs.readFileSync(publicKeyPath, 'utf8').trim()
        }
    } catch (err) {
        console.error('Failed to generate or read master SSH key files:', err)
        throw err
    }
}

const callPVE = async <T>(
    method: string,
    path: string,
    body?: Record<string, unknown> | FormData
): Promise<T> => {
    const url = `${getEnv('PROXMOX_URL').replace(/\/$/, '')}/api2/json${path}`
    const tokenId = getEnv('PROXMOX_TOKEN_ID')
    const tokenSecret = getEnv('PROXMOX_TOKEN_SECRET')

    if (!tokenId || !tokenSecret) {
        throw new Error('Proxmox token credentials are not configured')
    }

    const headers: Record<string, string> = {
        'Authorization': `PVEAPIToken=${tokenId}=${tokenSecret}`,
        'Accept': 'application/json'
    }

    let fetchBody: string | FormData | undefined
    if (body instanceof FormData) {
        fetchBody = body
    } else if (body) {
        fetchBody = JSON.stringify(body)
        headers['Content-Type'] = 'application/json'
    }

    if (process.env.NODE_TLS_REJECT_UNAUTHORIZED !== '0') {
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
    }

    const res = await fetch(url, {
        method,
        headers,
        body: fetchBody
    })

    if (!res.ok) {
        const errorText = await res.text()
        throw new Error(`Proxmox API Error (${res.status} ${res.statusText}): ${errorText}`)
    }

    const data = (await res.json()) as { data: T }
    return data.data
}

const waitTask = async (upid: string): Promise<void> => {
    const node = getEnv('PROXMOX_NODE', 'pve')
    while (true) {
        const status = await callPVE<{ status: string; exitstatus?: string }>(
            'GET',
            `/nodes/${node}/tasks/${encodeURIComponent(upid)}/status`
        )
        if (status.status === 'stopped') {
            if (status.exitstatus && status.exitstatus !== 'OK') {
                throw new Error(`Task failed: ${status.exitstatus}`)
            }
            break
        }
        await new Promise((resolve) => setTimeout(resolve, 1000))
    }
}

const extractGatewayToken = (userData: string): string => {
    const match = userData.match(/token:\s*([^\s\n"']+)/)
    return match ? match[1] : 'default-token'
}

const extractSubdomainAndDomain = (userData: string): { subdomain: string; domain: string } => {
    const match = userData.match(/server_name\s+([^\s;]+)\.([^;]+);/)
    if (match) {
        return { subdomain: match[1], domain: match[2].trim() }
    }
    return { subdomain: 'agent', domain: 'localhost' }
}

const extractAgentType = (userData: string): string => {
    return userData.includes('hermes-gateway') ? agentType.HERMES : agentType.OPENCLAW
}

const executeProxmoxSSH = (
    ip: string,
    password?: string,
    privateKeyPem?: string,
    command = '',
    username = getEnv('PROXMOX_SSH_USER', 'ubuntu')
): Promise<string> => {
    return new Promise((resolve, reject) => {
        const conn = new Client()
        let output = ''
        let truncated = false

        const timeout = setTimeout(() => {
            conn.end()
            reject(new Error('SSH command timed out'))
        }, 15000)

        conn.on('ready', () => {
            conn.exec(command, (err, stream) => {
                if (err) {
                    clearTimeout(timeout)
                    conn.end()
                    return reject(err)
                }
                stream.on('data', (data: Buffer) => {
                    if (!truncated) {
                        output += data.toString()
                        if (output.length > inputValidation.SSH_OUTPUT.MAX) {
                            output = output.slice(0, inputValidation.SSH_OUTPUT.MAX)
                            truncated = true
                        }
                    }
                })
                stream.stderr.on('data', (data: Buffer) => {
                    if (!truncated) {
                        output += data.toString()
                        if (output.length > inputValidation.SSH_OUTPUT.MAX) {
                            output = output.slice(0, inputValidation.SSH_OUTPUT.MAX)
                            truncated = true
                        }
                    }
                })
                stream.on('close', () => {
                    clearTimeout(timeout)
                    conn.end()
                    resolve(output.trim())
                })
            })
        })

        conn.on('error', (err) => {
            clearTimeout(timeout)
            conn.end()
            reject(err)
        })

        const connectOpts: any = {
            host: ip,
            port: sshDefaults.PORT,
            username,
            readyTimeout: sshDefaults.READY_TIMEOUT_MS,
            algorithms: {
                serverHostKey: ['ssh-ed25519', 'ssh-rsa', 'ecdsa-sha2-nistp256']
            },
            hostVerifier: (_key: Buffer, verify: (valid: boolean) => void) => {
                verify(true)
            }
        }

        if (privateKeyPem) {
            connectOpts.privateKey = privateKeyPem
        } else if (password) {
            connectOpts.password = password
        }

        conn.connect(connectOpts)
    })
}

export const generateProxmoxBashScript = (
    rootPassword: string,
    subdomain: string,
    domain: string,
    gatewayToken: string,
    selectedAgentType?: string
): string => {
    const isHermes = selectedAgentType === agentType.HERMES
    const fullDomain = `${subdomain}.${domain}`
    const gatewayPort = 18789

    const config: Record<string, unknown> = {
        gateway: {
            mode: 'local',
            auth: {
                mode: 'token',
                token: gatewayToken
            },
            remote: {
                token: gatewayToken
            },
            controlUi: {
                allowInsecureAuth: true,
                allowedOrigins: ['*'],
                dangerouslyDisableDeviceAuth: true
            },
            trustedProxies: ['127.0.0.1', '::1']
        },
        commands: {
            restart: true,
            bash: true
        },
        browser: {
            enabled: true,
            executablePath: '/usr/bin/google-chrome-stable',
            headless: true,
            noSandbox: true
        }
    }
    applyToolsDefaults(config)
    config.agents = { defaults: { sandbox: { mode: 'off' } } }
    const configJson = JSON.stringify(config, null, 2)

    let steps = ''

    if (isHermes) {
        steps = `
useradd -m -d /home/hermes -s /bin/bash hermes || true
echo 'hermes ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/hermes
chmod 0440 /etc/sudoers.d/hermes

apt_install build-essential python3-dev libffi-dev ripgrep ffmpeg

cat > /etc/systemd/system/hermes-gateway.service <<'SYSTEMD'
[Unit]
Description=Hermes Gateway
After=network.target

[Service]
Type=simple
User=hermes
Group=hermes
WorkingDirectory=/home/hermes
Environment=HOME=/home/hermes
Environment=PATH=/home/hermes/.local/bin:/usr/local/bin:/usr/bin:/bin
ExecStart=/home/hermes/.local/bin/hermes gateway run --replace
Restart=on-failure
RestartSec=10
StandardOutput=append:/var/log/hermes-gateway.log
StandardError=append:/var/log/hermes-gateway.log

[Install]
WantedBy=multi-user.target
SYSTEMD

touch /var/log/hermes-gateway.log /var/log/hermes-install.log
chown hermes:hermes /var/log/hermes-gateway.log /var/log/hermes-install.log
systemctl daemon-reload

nohup bash -c '
  su - hermes -c "curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh | bash -s -- --skip-setup" >> /var/log/hermes-install.log 2>&1
  if su - hermes -c "command -v hermes >/dev/null 2>&1 && hermes --version >/dev/null 2>&1"; then
    echo "hermes-install: success at $(date -Is)" >> /var/log/hermes-install.log
    systemctl enable hermes-gateway >> /var/log/hermes-install.log 2>&1
    systemctl start hermes-gateway >> /var/log/hermes-install.log 2>&1
  else
    echo "hermes-install: FAILED at $(date -Is)" >> /var/log/hermes-install.log
  fi
' > /dev/null 2>&1 &
`
    } else {
        steps = `
npm install -g openclaw@latest

useradd -r -m -d /home/openclaw -s /bin/bash openclaw || true
echo 'openclaw ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/openclaw

wget -q https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb -O /tmp/google-chrome.deb
dpkg -i /tmp/google-chrome.deb || apt_install -f
rm -f /tmp/google-chrome.deb

mkdir -p /home/openclaw/.openclaw
mkdir -p /home/openclaw/.openclaw/agents/main/agent

cat > /home/openclaw/.openclaw/openclaw.json << 'OCCONFIG'
${configJson}
OCCONFIG

chown -R openclaw:openclaw /home/openclaw

cat > /etc/systemd/system/openclaw-gateway.service <<'SYSTEMD'
[Unit]
Description=OpenClaw Gateway
After=network.target

[Service]
Type=simple
User=openclaw
Group=openclaw
WorkingDirectory=/home/openclaw
Environment=HOME=/home/openclaw
Environment=NODE_ENV=production
ExecStart=/usr/bin/openclaw gateway --port ${gatewayPort} --bind loopback
Restart=always
RestartSec=10
StartLimitIntervalSec=0
StandardOutput=append:/var/log/openclaw-gateway.log
StandardError=append:/var/log/openclaw-gateway.log

[Install]
WantedBy=multi-user.target
SYSTEMD

systemctl daemon-reload
systemctl enable openclaw-gateway
systemctl start openclaw-gateway

for i in $(seq 1 30); do
  if curl -sf -o /dev/null http://127.0.0.1:${gatewayPort}; then
    break
  fi
  systemctl restart openclaw-gateway 2>/dev/null || true
  sleep 10
done
`
    }

    const brewSteps = isHermes ? '' : `
cat > /tmp/install-brew.sh << 'BREWSCRIPT'
#!/bin/bash
su - openclaw -c 'NONINTERACTIVE=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"'
echo 'eval "$(/home/linuxbrew/.linuxbrew/bin/brew shellenv)"' >> /home/openclaw/.bashrc
BREWSCRIPT
chmod +x /tmp/install-brew.sh
nohup /tmp/install-brew.sh > /var/log/brew-install.log 2>&1 &
`

    const webProxySteps = isHermes ? '' : `
cat > /etc/nginx/sites-available/openclaw-gateway << 'NGINXEOF'
map $http_upgrade $connection_upgrade {
    default upgrade;
    '' close;
}

server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;
    return 444;
}

server {
    listen 80;
    listen [::]:80;
    server_name ${fullDomain};

    location / {
        proxy_pass http://127.0.0.1:${gatewayPort};
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 86400;
        proxy_send_timeout 86400;

        proxy_hide_header Content-Security-Policy;
        proxy_hide_header X-Frame-Options;
        add_header Content-Security-Policy "frame-ancestors https://${domain} https://*.${domain} http://localhost:* https://localhost:*" always;
    }
}
NGINXEOF

ln -sf /etc/nginx/sites-available/openclaw-gateway /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
mkdir -p /etc/systemd/system/nginx.service.d
cat > /etc/systemd/system/nginx.service.d/override.conf <<'NGINXOVERRIDE'
[Service]
Restart=always
RestartSec=5
NGINXOVERRIDE
systemctl daemon-reload
nginx -t && systemctl reload nginx
systemctl enable nginx

for i in $(seq 1 24); do
  if host ${fullDomain} 1.1.1.1 > /dev/null 2>&1; then
    sleep 15
    break
  fi
  sleep 5
done

certbot --nginx -d ${fullDomain} --non-interactive --agree-tos --email ssl@${domain} --redirect || true
echo "0 0,12 * * * root certbot renew --quiet --deploy-hook 'systemctl reload nginx'" > /etc/cron.d/certbot-renew
chmod 644 /etc/cron.d/certbot-renew
`

    return `#!/bin/bash
set -e
export DEBIAN_FRONTEND=noninteractive

echo "Starting bootstrap installation..."

# Retry helper functions for robust apt execution
apt_update() {
  for i in {1..20}; do
    while fuser /var/lib/dpkg/lock-frontend /var/lib/apt/lists/lock /var/lib/dpkg/lock >/dev/null 2>&1; do
      sleep 3
    done
    if apt-get update "$@"; then
      return 0
    fi
    echo "apt-get update failed, retrying ($i/20)..."
    sleep 5
  done
  return 1
}

apt_install() {
  for i in {1..20}; do
    while fuser /var/lib/dpkg/lock-frontend /var/lib/apt/lists/lock /var/lib/dpkg/lock >/dev/null 2>&1; do
      sleep 3
    done
    if apt-get install -y "$@"; then
      return 0
    fi
    echo "apt-get install failed for $@, retrying ($i/20)..."
    sleep 5
  done
  return 1
}

# Wait for apt/dpkg locks to release
apt_update

# Basic packages
apt_install curl nginx certbot python3-certbot-nginx ufw ca-certificates gnupg git dnsutils

# Install Node.js
mkdir -p /etc/apt/keyrings
curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg || true
echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main" > /etc/apt/sources.list.d/nodesource.list
apt_update -o Dir::Etc::sourcelist="sources.list.d/nodesource.list" -o Dir::Etc::sourceparts="-" -o APT::Get::List-Cleanup="0"
apt_install nodejs

# Configure sshd to allow password authentication (so dashboard works)
passwd -u root || true
echo "root:${rootPassword}" | chpasswd
sed -i 's/^#*PermitRootLogin.*/PermitRootLogin yes/' /etc/ssh/sshd_config
sed -i 's/^#*PasswordAuthentication.*/PasswordAuthentication yes/' /etc/ssh/sshd_config
printf 'PermitRootLogin yes\\nPasswordAuthentication yes\\n' > /etc/ssh/sshd_config.d/01-clawnode.conf
systemctl reload ssh || systemctl reload sshd || true

# Agent-specific setup
${steps}

# Setup UFW
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# Nginx reverse proxy
${webProxySteps}

# Homebrew
${brewSteps}

echo "Bootstrap installation complete!"
`
}

const getFreeStaticIP = async (node: string): Promise<string> => {
    const staticIpsStr = getEnv('PROXMOX_STATIC_IPS', '45.84.197.129,45.84.197.134,45.84.197.135')
    const staticIps = staticIpsStr.split(',').map((ip) => ip.trim())

    const vms = await callPVE<{ vmid: number }[]>('GET', `/nodes/${node}/qemu`)
    const usedIps = new Set<string>()

    for (const vm of vms) {
        try {
            const config = await callPVE<{ ipconfig0?: string }>('GET', `/nodes/${node}/qemu/${vm.vmid}/config`)
            if (config.ipconfig0) {
                const match = config.ipconfig0.match(/ip=([0-9.]+)/)
                if (match) {
                    usedIps.add(match[1])
                }
            }
        } catch {
            // Ignore config read failures
        }
    }

    const freeIp = staticIps.find((ip) => !usedIps.has(ip))
    if (!freeIp) {
        throw new Error('No free static IPs available in the configured range')
    }

    return freeIp
}

const proxmox: CloudProvider = {
    createServer: async (
        name: string,
        serverType: string,
        _location: string,
        rootPassword?: string,
        _sshKeyIds?: number[],
        _snapshotId?: string,
        userData?: string
    ): Promise<CreateServerResult> => {
        const node = getEnv('PROXMOX_NODE', 'pve')
        const templateVmid = getEnv('PROXMOX_TEMPLATE_VMID')

        if (!templateVmid) {
            throw new Error('PROXMOX_TEMPLATE_VMID is not configured')
        }

        // 1. Get next available VM ID
        const nextIdResponse = await callPVE<string>('GET', '/cluster/nextid')
        const vmid = parseInt(nextIdResponse, 10)

        if (isNaN(vmid)) {
            throw new Error(`Failed to obtain next valid VMID. Received: ${nextIdResponse}`)
        }

        // 2. Clone template VM
        const cloneBody: Record<string, unknown> = {
            newid: vmid,
            name,
            full: 1
        }
        const storage = getEnv('PROXMOX_VM_STORAGE')
        if (storage) {
            cloneBody.storage = storage
        }

        const cloneUpid = await callPVE<string>(
            'POST',
            `/nodes/${node}/qemu/${templateVmid}/clone`,
            cloneBody
        )
        await waitTask(cloneUpid)

        // 3. Find a free static IP
        const freeIp = await getFreeStaticIP(node)
        const gateway = getEnv('PROXMOX_GATEWAY', '45.84.197.1')
        const netmask = getEnv('PROXMOX_NETMASK', '24')

        // 4. Load SSH keys (DB lookup + fallback for test script)
        const agentId = name.split('-').pop()
        let userSshKeyStr = ''

        if (agentId && agentId.length === 36) {
            try {
                const agentRow = await db
                    .select()
                    .from(agents)
                    .where(eq(agents.id, agentId))
                    .limit(1)
                
                if (agentRow[0] && agentRow[0].sshKeyId) {
                    const keyRow = await db
                        .select()
                        .from(sshKeys)
                        .where(eq(sshKeys.id, agentRow[0].sshKeyId))
                        .limit(1)
                    if (keyRow[0]) {
                        userSshKeyStr = keyRow[0].publicKey.trim()
                    }
                }
            } catch (dbErr) {
                console.error('Proxmox createServer: failed to retrieve SSH key from DB', dbErr)
            }
        }

        // Get or generate master SSH key
        const masterKey = getOrCreateMasterSSHKey()
        
        // Combine master SSH key and user's SSH key
        const keysToInject: string[] = [masterKey.publicKey]
        if (userSshKeyStr) {
            keysToInject.push(userSshKeyStr)
        }

        // 5. Configure VM config directly via Proxmox API (sets password, SSH keys & static networking)
        const configBody: Record<string, unknown> = {
            ipconfig0: `ip=${freeIp}/${netmask},gw=${gateway}`,
            scsihw: 'virtio-scsi-pci',
            ciuser: getEnv('PROXMOX_SSH_USER', 'ubuntu'),
            sshkeys: encodeURIComponent(keysToInject.join('\n'))
        }

        if (rootPassword) {
            configBody.cipassword = rootPassword
        }

        // Map plan specs if matching plan found
        const plan = PLANS.find((p) => p.id === serverType)
        if (plan) {
            configBody.cores = plan.cpu
            configBody.memory = plan.memory * 1024
        }

        await callPVE<unknown>(
            'POST',
            `/nodes/${node}/qemu/${vmid}/config`,
            configBody
        )

        // 5.5 Resize VM disk to match plan disk size
        if (plan && plan.disk) {
            // Wait 3 seconds to ensure Proxmox releases any locks from cloning/configuring before resizing
            await new Promise((resolve) => setTimeout(resolve, 3000))
            
            let resized = false
            for (let attempt = 1; attempt <= 3; attempt++) {
                try {
                    const resizeUpid = await callPVE<string>(
                        'PUT',
                        `/nodes/${node}/qemu/${vmid}/resize`,
                        {
                            disk: 'scsi0',
                            size: `${plan.disk}G`
                        }
                    )
                    await waitTask(resizeUpid)
                    resized = true
                    break
                } catch (resizeErr: any) {
                    console.error(`Attempt ${attempt} failed to resize VM disk to ${plan.disk}G:`, resizeErr.message)
                    if (attempt < 3) {
                        await new Promise((resolve) => setTimeout(resolve, 5000))
                    }
                }
            }
            if (!resized) {
                console.error(`Failed to resize VM disk to ${plan.disk}G after 3 attempts.`)
            }
        }

        // 6. Start the VM
        const startUpid = await callPVE<string>(
            'POST',
            `/nodes/${node}/qemu/${vmid}/status/start`
        )
        await waitTask(startUpid)

        // 7. Run bootstrap script via SSH in the background
        if (userData && rootPassword) {
            const gatewayToken = extractGatewayToken(userData)
            const { subdomain, domain } = extractSubdomainAndDomain(userData)
            const agentTypeVal = extractAgentType(userData)

            const bashScript = generateProxmoxBashScript(
                rootPassword,
                subdomain,
                domain,
                gatewayToken,
                agentTypeVal
            )

            // Connect over SSH with retries using the master private key
            let connected = false
            const privateKeyPem = masterKey.privateKey

            for (let attempt = 1; attempt <= 25; attempt++) {
                try {
                    // Try connecting using the master private key first, then fallback to rootPassword if any
                    await executeProxmoxSSH(freeIp, rootPassword, privateKeyPem, 'echo ready')
                    connected = true
                    break
                } catch (err: any) {
                    await new Promise((resolve) => setTimeout(resolve, 5000))
                }
            }

            if (!connected) {
                throw new Error(`VM started successfully at ${freeIp}, but SSH connection timed out.`)
            }

            // Write and execute script in the background
            const runCommand = `cat << 'EOF' > /tmp/bootstrap.sh\n${bashScript}\nEOF\nsudo bash -c "nohup bash /tmp/bootstrap.sh > /var/log/bootstrap.log 2>&1 &"`
            
            await executeProxmoxSSH(freeIp, rootPassword, privateKeyPem, runCommand)
        }

        return {
            serverId: vmid,
            ip: freeIp,
            rootPassword: rootPassword || ''
        }
    },

    getServer: async (serverId: string): Promise<ServerStatus> => {
        const node = getEnv('PROXMOX_NODE', 'pve')
        const vmid = parseInt(serverId, 10)
        
        const status = await callPVE<{ qmpstatus: string }>(
            'GET',
            `/nodes/${node}/qemu/${vmid}/status/current`
        )

        let ip = '0.0.0.0'
        try {
            const config = await callPVE<{ ipconfig0?: string }>('GET', `/nodes/${node}/qemu/${vmid}/config`)
            if (config.ipconfig0) {
                const match = config.ipconfig0.match(/ip=([0-9.]+)/)
                if (match) {
                    ip = match[1]
                }
            }
        } catch {
            // Ignore config read failures
        }

        return {
            status: status.qmpstatus === 'running' ? 'running' : 'stopped',
            ip
        }
    },

    getServers: async (): Promise<Map<string, ServerStatus>> => {
        const node = getEnv('PROXMOX_NODE', 'pve')
        const vms = await callPVE<{ vmid: number; name: string; status: string }[]>(
            'GET',
            `/nodes/${node}/qemu`
        )
        
        const results = await Promise.all(vms.map(async (vm) => {
            let ip = '0.0.0.0'
            try {
                const config = await callPVE<{ ipconfig0?: string }>('GET', `/nodes/${node}/qemu/${vm.vmid}/config`)
                if (config.ipconfig0) {
                    const match = config.ipconfig0.match(/ip=([0-9.]+)/)
                    if (match) {
                        ip = match[1]
                    }
                }
            } catch {
                // Ignore config read failures
            }
            return {
                vmid: vm.vmid.toString(),
                status: vm.status === 'running' ? 'running' : 'stopped',
                ip
            }
        }))

        const map = new Map<string, ServerStatus>()
        for (const res of results) {
            map.set(res.vmid, { status: res.status, ip: res.ip })
        }
        return map
    },

    startServer: async (serverId: string): Promise<void> => {
        const node = getEnv('PROXMOX_NODE', 'pve')
        const vmid = parseInt(serverId, 10)
        await callPVE<unknown>('POST', `/nodes/${node}/qemu/${vmid}/status/start`)
    },

    stopServer: async (serverId: string): Promise<void> => {
        const node = getEnv('PROXMOX_NODE', 'pve')
        const vmid = parseInt(serverId, 10)
        await callPVE<unknown>('POST', `/nodes/${node}/qemu/${vmid}/status/stop`)
    },

    restartServer: async (serverId: string): Promise<void> => {
        const node = getEnv('PROXMOX_NODE', 'pve')
        const vmid = parseInt(serverId, 10)
        await callPVE<unknown>('POST', `/nodes/${node}/qemu/${vmid}/status/reboot`)
    },

    deleteServer: async (serverId: string): Promise<void> => {
        const node = getEnv('PROXMOX_NODE', 'pve')
        const vmid = parseInt(serverId, 10)
        
        try {
            await callPVE<unknown>('POST', `/nodes/${node}/qemu/${vmid}/status/stop`)
            for (let i = 0; i < 10; i++) {
                const status = await callPVE<{ qmpstatus: string }>(
                    'GET',
                    `/nodes/${node}/qemu/${vmid}/status/current`
                )
                if (status.qmpstatus !== 'running') break
                await new Promise((resolve) => setTimeout(resolve, 1000))
            }
        } catch {
            // Ignore
        }

        const deleteUpid = await callPVE<string>('DELETE', `/nodes/${node}/qemu/${vmid}`)
        await waitTask(deleteUpid)
    },

    getServerTypes: async (): Promise<ServerTypeInfo[]> => {
        return PLANS.map((p) => ({
            name: p.id,
            description: p.name,
            cores: p.cpu,
            memory: p.memory,
            disk: p.disk,
            architecture: p.architecture,
            priceHourly: parseFloat((p.priceMonthly / 730).toFixed(4)),
            priceMonthly: p.priceMonthly
        }))
    },

    getLocations: async (): Promise<LocationInfo[]> => {
        return [
            {
                id: 'proxmox',
                name: 'Germany',
                city: 'Germany',
                country: 'DE',
                disabled: false
            }
        ]
    },

    getRawServerTypes: async (): Promise<RawServerType[]> => {
        return PLANS.map((p, idx) => ({
            id: idx + 1,
            name: p.id
        }))
    },

    getDatacenters: async (): Promise<DatacenterAvailability[]> => {
        return [
            {
                name: 'pve',
                locationName: 'proxmox',
                availableServerTypeIds: PLANS.map((_, idx) => idx + 1)
            }
        ]
    },

    createSSHKey: async (_name: string, _publicKey: string): Promise<CreateSSHKeyResult> => {
        return {
            id: Math.floor(Math.random() * 1000000),
            name: _name,
            fingerprint: ''
        }
    },

    deleteSSHKey: async (): Promise<void> => {},
    getVolumePricing: async (): Promise<VolumePricingResult> => {
        return { pricePerGbMonthly: 0 }
    },
    createVolume: async (name: string, size: number, location: string): Promise<VolumeInfo> => {
        return { id: Math.floor(Math.random() * 1000000), size, location }
    },
    attachVolume: async (): Promise<void> => {},
    detachVolume: async (): Promise<void> => {},
    deleteVolume: async (): Promise<void> => {},
    getVolume: async (volumeId: number): Promise<VolumeDetails> => {
        return { id: volumeId, size: 0, status: 'available', serverId: null }
    }
}

export default proxmox