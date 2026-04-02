import { EventEmitter } from 'events'

class MockStream extends EventEmitter {
    stderr = new EventEmitter()
}

class MockClient extends EventEmitter {
    exec = vi.fn()
    end = vi.fn()
    connect = vi.fn()
}

vi.mock('ssh2', () => ({
    Client: vi.fn(() => {
        const client = new MockClient()
        client.connect = vi.fn(function (this: MockClient) {
            setTimeout(() => this.emit('ready'), 0)
        })
        return client
    })
}))

import executeSSH from '@/services/ssh'

describe('executeSSH', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('resolves with command output', async () => {
        const { Client } = await import('ssh2')
        vi.mocked(Client).mockImplementation(() => {
            const client = new MockClient()
            client.connect = vi.fn(function (this: MockClient) {
                setTimeout(() => this.emit('ready'), 0)
            })
            client.exec = vi.fn((_cmd, cb) => {
                const stream = new MockStream()
                cb(null, stream as never)
                setTimeout(() => {
                    stream.emit('data', Buffer.from('hello world'))
                    stream.emit('close')
                }, 0)
            })
            return client as never
        })

        const result = await executeSSH('1.2.3.4', 'pass', 'echo hello')
        expect(result).toBe('hello world')
    })

    it('strips ANSI codes from output', async () => {
        const { Client } = await import('ssh2')
        vi.mocked(Client).mockImplementation(() => {
            const client = new MockClient()
            client.connect = vi.fn(function (this: MockClient) {
                setTimeout(() => this.emit('ready'), 0)
            })
            client.exec = vi.fn((_cmd, cb) => {
                const stream = new MockStream()
                cb(null, stream as never)
                setTimeout(() => {
                    stream.emit('data', Buffer.from('\x1b[32mgreen\x1b[0m'))
                    stream.emit('close')
                }, 0)
            })
            return client as never
        })

        const result = await executeSSH('1.2.3.4', 'pass', 'cmd')
        expect(result).toBe('green')
    })

    it('rejects on connection error', async () => {
        const { Client } = await import('ssh2')
        vi.mocked(Client).mockImplementation(() => {
            const client = new MockClient()
            client.connect = vi.fn(function (this: MockClient) {
                setTimeout(
                    () => this.emit('error', new Error('Connection refused')),
                    0
                )
            })
            return client as never
        })

        await expect(executeSSH('1.2.3.4', 'pass', 'cmd')).rejects.toThrow(
            'Connection refused'
        )
    })

    it('rejects on exec error', async () => {
        const { Client } = await import('ssh2')
        vi.mocked(Client).mockImplementation(() => {
            const client = new MockClient()
            client.connect = vi.fn(function (this: MockClient) {
                setTimeout(() => this.emit('ready'), 0)
            })
            client.exec = vi.fn((_cmd, cb) => {
                cb(new Error('exec failed'), null as never)
            })
            return client as never
        })

        await expect(executeSSH('1.2.3.4', 'pass', 'cmd')).rejects.toThrow(
            'exec failed'
        )
    })

    it('includes stderr in output', async () => {
        const { Client } = await import('ssh2')
        vi.mocked(Client).mockImplementation(() => {
            const client = new MockClient()
            client.connect = vi.fn(function (this: MockClient) {
                setTimeout(() => this.emit('ready'), 0)
            })
            client.exec = vi.fn((_cmd, cb) => {
                const stream = new MockStream()
                cb(null, stream as never)
                setTimeout(() => {
                    stream.stderr.emit('data', Buffer.from('warning'))
                    stream.emit('data', Buffer.from(' output'))
                    stream.emit('close')
                }, 0)
            })
            return client as never
        })

        const result = await executeSSH('1.2.3.4', 'pass', 'cmd')
        expect(result).toContain('warning')
        expect(result).toContain('output')
    })

    it('rejects on timeout', async () => {
        const { Client } = await import('ssh2')
        vi.mocked(Client).mockImplementation(() => {
            const client = new MockClient()
            client.connect = vi.fn(function (this: MockClient) {
                setTimeout(() => this.emit('ready'), 0)
            })
            client.exec = vi.fn((_cmd, cb) => {
                const stream = new MockStream()
                cb(null, stream as never)
            })
            return client as never
        })

        await expect(executeSSH('1.2.3.4', 'pass', 'cmd', 50)).rejects.toThrow(
            'SSH command timed out'
        )
    })
})