import { generateCloudInit } from '@/controllers/claws/helpers'

describe('generateCloudInit', () => {
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