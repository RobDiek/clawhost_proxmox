import { copyToClipboard } from '@/lib'

describe('copyToClipboard', () => {
    beforeEach(() => {
        vi.restoreAllMocks()
    })

    it('uses navigator.clipboard.writeText when available', async () => {
        const writeText = vi.fn().mockResolvedValue(undefined)
        Object.defineProperty(navigator, 'clipboard', {
            value: { writeText },
            writable: true,
            configurable: true
        })

        await copyToClipboard('hello')
        expect(writeText).toHaveBeenCalledWith('hello')
    })

    it('falls back to textarea method when clipboard API fails', async () => {
        Object.defineProperty(navigator, 'clipboard', {
            value: {
                writeText: vi.fn().mockRejectedValue(new Error('not allowed'))
            },
            writable: true,
            configurable: true
        })

        const execCommand = vi.fn()
        document.execCommand = execCommand

        const appendChild = vi.spyOn(document.body, 'appendChild')
        const removeChild = vi.spyOn(document.body, 'removeChild')

        await copyToClipboard('fallback text')

        expect(appendChild).toHaveBeenCalled()
        expect(removeChild).toHaveBeenCalled()
        expect(execCommand).toHaveBeenCalledWith('copy')
    })
})