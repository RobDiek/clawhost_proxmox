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

import sshBuffer from '@/services/sshBuffer'

describe('sshBuffer', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('resolves with concatenated buffer output', async () => {
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
                    stream.emit('data', Buffer.from('chunk1'))
                    stream.emit('data', Buffer.from('chunk2'))
                    stream.emit('close')
                }, 0)
            })
            return client as never
        })

        const result = await sshBuffer('1.2.3.4', 'pass', 'cat /tmp/file')
        expect(Buffer.isBuffer(result)).toBe(true)
        expect(result.toString()).toBe('chunk1chunk2')
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

        await expect(sshBuffer('1.2.3.4', 'pass', 'cmd')).rejects.toThrow(
            'Connection refused'
        )
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

        await expect(sshBuffer('1.2.3.4', 'pass', 'cmd', 50)).rejects.toThrow(
            'SSH command timed out'
        )
    })

    it('returns empty buffer when no output', async () => {
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
                    stream.emit('close')
                }, 0)
            })
            return client as never
        })

        const result = await sshBuffer('1.2.3.4', 'pass', 'cmd')
        expect(result.length).toBe(0)
    })
})