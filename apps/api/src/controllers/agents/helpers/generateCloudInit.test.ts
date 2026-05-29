import { generateCloudInit } from '@/controllers/agents/helpers'

describe('generateCloudInit', () => {
    describe('openclaw', () => {
        const output = generateCloudInit(
            'myP@ss123',
            'test-claw',
            'clawhost.cloud',
            'tok_abc123'
        )

        it('starts with #cloud-config', () => {
            expect(output.startsWith('#cloud-config')).toBe(true)
        })

        it('includes the root password', () => {
            expect(output).toContain('root:myP@ss123')
        })

        it('includes the full domain', () => {
            expect(output).toContain('test-claw.clawhost.cloud')
        })

        it('includes the gateway token in config', () => {
            expect(output).toContain('tok_abc123')
        })

        it('includes required packages', () => {
            expect(output).toContain('- curl')
            expect(output).toContain('- nginx')
            expect(output).toContain('- certbot')
            expect(output).toContain('- ufw')
            expect(output).toContain('- git')
        })

        it('sets up systemd service', () => {
            expect(output).toContain('openclaw-gateway.service')
            expect(output).toContain('systemctl enable openclaw-gateway')
        })

        it('configures nginx reverse proxy', () => {
            expect(output).toContain('proxy_pass http://127.0.0.1:18789')
        })

        it('enables firewall rules', () => {
            expect(output).toContain('ufw allow 22/tcp')
            expect(output).toContain('ufw allow 80/tcp')
            expect(output).toContain('ufw allow 443/tcp')
        })

        it('sets up certbot SSL', () => {
            expect(output).toContain('certbot --nginx')
            expect(output).toContain('certbot renew')
        })

        it('includes swap setup', () => {
            expect(output).toContain('fallocate -l 2G /swapfile')
        })

        it('creates openclaw user', () => {
            expect(output).toContain('useradd -r -m -d /home/openclaw')
        })

        it('includes openclaw config JSON with tools defaults', () => {
            expect(output).toContain('"profile": "full"')
            expect(output).toContain('"host": "gateway"')
        })

        it('includes final message', () => {
            expect(output).toContain('OpenClaw instance ready!')
        })
    })

    describe('hermes', () => {
        const output = generateCloudInit(
            'myP@ss123',
            'test-hermes',
            'clawhost.cloud',
            'tok_hermes456',
            'hermes'
        )

        it('starts with #cloud-config', () => {
            expect(output.startsWith('#cloud-config')).toBe(true)
        })

        it('includes the root password', () => {
            expect(output).toContain('root:myP@ss123')
        })

        it('creates hermes user', () => {
            expect(output).toContain('useradd -m -d /home/hermes')
        })

        it('runs hermes install script with --skip-setup', () => {
            expect(output).toContain(
                'NousResearch/hermes-agent/main/scripts/install.sh'
            )
            expect(output).toContain('--skip-setup')
        })

        it('verifies hermes binary is installed', () => {
            expect(output).toContain('hermes --version')
        })

        it('does not write a clawhost-managed hermes config file', () => {
            expect(output).not.toContain('hermes.json')
        })

        it('installs and enables the hermes-gateway systemd unit', () => {
            expect(output).toContain(
                '/etc/systemd/system/hermes-gateway.service'
            )
            expect(output).toContain(
                'ExecStart=/home/hermes/.local/bin/hermes gateway run --replace'
            )
            expect(output).toContain('systemctl enable hermes-gateway')
            expect(output).toContain('systemctl start hermes-gateway')
        })

        it('does not set up nginx reverse proxy', () => {
            expect(output).not.toContain('proxy_pass http://127.0.0.1:18789')
            expect(output).not.toContain('/etc/nginx/sites-available/')
        })

        it('does not run certbot (no web service for Hermes)', () => {
            expect(output).not.toContain('certbot --nginx')
        })

        it('does not embed a gateway token (Hermes has no HTTP gateway)', () => {
            expect(output).not.toContain('tok_hermes456')
        })

        it('opens ssh through ufw', () => {
            expect(output).toContain('ufw allow 22/tcp')
        })

        it('includes final message pointing users to SSH/terminal', () => {
            expect(output).toContain('Hermes instance ready!')
            expect(output).toContain('SSH')
        })
    })
})