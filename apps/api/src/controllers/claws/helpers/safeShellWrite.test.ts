vi.mock('@/services/ssh', () => ({
    default: vi.fn()
}))

import { safeShellWrite } from '@/controllers/claws/helpers'
import executeSSH from '@/services/ssh'

describe('safeShellWrite', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        vi.mocked(executeSSH).mockResolvedValue('')
    })

    it('calls executeSSH with base64 encoded content', async () => {
        await safeShellWrite('1.2.3.4', 'pass', '/tmp/test.txt', 'hello world')

        expect(executeSSH).toHaveBeenCalledOnce()
        const call = vi.mocked(executeSSH).mock.calls[0]
        expect(call[0]).toBe('1.2.3.4')
        expect(call[1]).toBe('pass')
        expect(call[2]).toContain('base64 -d')
        expect(call[2]).toContain('/tmp/test.txt')
    })

    it('encodes content as base64', async () => {
        await safeShellWrite('1.2.3.4', 'pass', '/tmp/file', 'test content')

        const command = vi.mocked(executeSSH).mock.calls[0][2]
        const encoded = Buffer.from('test content').toString('base64')
        expect(command).toContain(encoded)
    })

    it('escapes single quotes in file path', async () => {
        await safeShellWrite('1.2.3.4', 'pass', "/tmp/it's.txt", 'data')

        const command = vi.mocked(executeSSH).mock.calls[0][2]
        expect(command).toContain("'\\''")
    })

    it('uses default timeout of 10000', async () => {
        await safeShellWrite('1.2.3.4', 'pass', '/tmp/f', 'data')

        expect(executeSSH).toHaveBeenCalledWith(
            '1.2.3.4',
            'pass',
            expect.any(String),
            10000
        )
    })

    it('accepts custom timeout', async () => {
        await safeShellWrite('1.2.3.4', 'pass', '/tmp/f', 'data', 5000)

        expect(executeSSH).toHaveBeenCalledWith(
            '1.2.3.4',
            'pass',
            expect.any(String),
            5000
        )
    })
})