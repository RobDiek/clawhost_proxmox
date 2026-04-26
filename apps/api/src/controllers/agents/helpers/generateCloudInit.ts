import { agentType } from '@openclaw/shared'
import applyToolsDefaults from '@/controllers/agents/helpers/applyToolsDefaults'

const GATEWAY_PORT = 18789

const generateOpenClawSteps = (
    gatewayToken: string,
    configJson: string
): string => `
  - npm install -g openclaw@latest

  - useradd -r -m -d /home/openclaw -s /bin/bash openclaw
  - echo 'openclaw ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/openclaw

  - wget -q https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb -O /tmp/google-chrome.deb
  - dpkg -i /tmp/google-chrome.deb || apt-get install -f -y
  - rm -f /tmp/google-chrome.deb

  - mkdir -p /home/openclaw/.openclaw
  - mkdir -p /home/openclaw/.openclaw/agents/main/agent

  - |
    cat > /home/openclaw/.openclaw/openclaw.json << 'OCCONFIG'
    ${configJson}
    OCCONFIG

  - chown -R openclaw:openclaw /home/openclaw

  - |
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
    ExecStart=/usr/bin/openclaw gateway --port ${GATEWAY_PORT} --bind loopback
    Restart=always
    RestartSec=10
    StartLimitIntervalSec=0
    StandardOutput=append:/var/log/openclaw-gateway.log
    StandardError=append:/var/log/openclaw-gateway.log

    [Install]
    WantedBy=multi-user.target
    SYSTEMD

  - systemctl daemon-reload
  - systemctl enable openclaw-gateway
  - systemctl start openclaw-gateway

  - |
    for i in $(seq 1 30); do
      if curl -sf -o /dev/null http://127.0.0.1:${GATEWAY_PORT}; then
        break
      fi
      systemctl restart openclaw-gateway 2>/dev/null || true
      sleep 10
    done`

const generateHermesSteps = (gatewayToken: string): string => `
  - useradd -r -m -d /home/hermes -s /bin/bash hermes
  - echo 'hermes ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/hermes

  - |
    su - hermes -c 'curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh | bash'

  - mkdir -p /home/hermes/.hermes
  - |
    cat > /home/hermes/.hermes/hermes.json << 'HERMESCONFIG'
    ${JSON.stringify({ gateway: { auth: { mode: 'token', token: gatewayToken }, remote: { token: gatewayToken } } }, null, 2).replace(/\n/g, '\n    ')}
    HERMESCONFIG
  - chown -R hermes:hermes /home/hermes/.hermes

  - |
    cat > /etc/systemd/system/hermes-gateway.service <<'SYSTEMD'
    [Unit]
    Description=Hermes Agent Gateway
    After=network.target

    [Service]
    Type=simple
    User=hermes
    Group=hermes
    WorkingDirectory=/home/hermes
    Environment=HOME=/home/hermes
    Environment=NODE_ENV=production
    ExecStart=/home/hermes/.local/bin/hermes gateway start --port ${GATEWAY_PORT}
    Restart=always
    RestartSec=10
    StartLimitIntervalSec=0
    StandardOutput=append:/var/log/hermes-gateway.log
    StandardError=append:/var/log/hermes-gateway.log

    [Install]
    WantedBy=multi-user.target
    SYSTEMD

  - systemctl daemon-reload
  - systemctl enable hermes-gateway
  - systemctl start hermes-gateway

  - |
    for i in $(seq 1 30); do
      if curl -sf -o /dev/null http://127.0.0.1:${GATEWAY_PORT}; then
        break
      fi
      systemctl restart hermes-gateway 2>/dev/null || true
      sleep 10
    done`

const generateBrewStep = (username: string): string => `
  - |
    cat > /tmp/install-brew.sh << 'BREWSCRIPT'
    #!/bin/bash
    su - ${username} -c 'NONINTERACTIVE=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"'
    echo 'eval "$(/home/linuxbrew/.linuxbrew/bin/brew shellenv)"' >> /home/${username}/.bashrc
    BREWSCRIPT
    chmod +x /tmp/install-brew.sh
    nohup /tmp/install-brew.sh > /var/log/brew-install.log 2>&1 &`

const generateCloudInit = (
    rootPassword: string,
    subdomain: string,
    domain: string,
    gatewayToken: string,
    selectedAgentType?: string
): string => {
    const isHermes = selectedAgentType === agentType.HERMES
    const fullDomain = `${subdomain}.${domain}`

    let agentSteps: string
    let agentUser: string

    if (isHermes) {
        agentSteps = generateHermesSteps(gatewayToken)
        agentUser = 'hermes'
    } else {
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

        const configJson = JSON.stringify(config, null, 2).replace(
            /\n/g,
            '\n    '
        )
        agentSteps = generateOpenClawSteps(gatewayToken, configJson)
        agentUser = 'openclaw'
    }

    const serviceName = isHermes ? 'hermes-gateway' : 'openclaw-gateway'

    return `#cloud-config

ssh_pwauth: true

chpasswd:
  list: |
    root:${rootPassword}
  expire: false

package_update: true

packages:
  - curl
  - nginx
  - certbot
  - python3-certbot-nginx
  - ufw
  - ca-certificates
  - gnupg
  - git
  - dnsutils

runcmd:
  - fallocate -l 2G /swapfile
  - chmod 600 /swapfile
  - mkswap /swapfile
  - swapon /swapfile
  - echo '/swapfile none swap sw 0 0' >> /etc/fstab

  - mkdir -p /etc/apt/keyrings
  - curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
  - echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main" > /etc/apt/sources.list.d/nodesource.list
  - apt-get update -o Dir::Etc::sourcelist="sources.list.d/nodesource.list" -o Dir::Etc::sourceparts="-" -o APT::Get::List-Cleanup="0"
  - apt-get install -y nodejs
${agentSteps}

  - ufw allow 22/tcp
  - ufw allow 80/tcp
  - ufw allow 443/tcp
  - ufw --force enable

  - |
    cat > /etc/nginx/sites-available/${serviceName} << 'NGINXEOF'
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
            proxy_pass http://127.0.0.1:${GATEWAY_PORT};
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

  - ln -sf /etc/nginx/sites-available/${serviceName} /etc/nginx/sites-enabled/
  - rm -f /etc/nginx/sites-enabled/default
  - mkdir -p /etc/systemd/system/nginx.service.d
  - |
    cat > /etc/systemd/system/nginx.service.d/override.conf <<'NGINXOVERRIDE'
    [Service]
    Restart=always
    RestartSec=5
    NGINXOVERRIDE
  - systemctl daemon-reload
  - nginx -t && systemctl reload nginx
  - systemctl enable nginx

  - |
    for i in $(seq 1 24); do
      if host ${fullDomain} 1.1.1.1 > /dev/null 2>&1; then
        sleep 15
        break
      fi
      sleep 5
    done
  - certbot --nginx -d ${fullDomain} --non-interactive --agree-tos --email ssl@${domain} --redirect

  - echo "0 0,12 * * * root certbot renew --quiet --deploy-hook 'systemctl reload nginx'" > /etc/cron.d/certbot-renew
  - chmod 644 /etc/cron.d/certbot-renew
${generateBrewStep(agentUser)}

final_message: "${isHermes ? 'Hermes' : 'OpenClaw'} instance ready! Access dashboard at https://${fullDomain}/"
`
}

export default generateCloudInit