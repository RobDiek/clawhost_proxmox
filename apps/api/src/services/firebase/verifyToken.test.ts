const mockVerifyIdToken = vi.fn()

vi.mock('@/services/firebase/auth', () => ({
    default: () => ({
        verifyIdToken: mockVerifyIdToken
    })
}))

import { verifyToken } from '@/services/firebase'

describe('verifyToken', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('returns decoded token on success', async () => {
        const decoded = { uid: 'user-123', email: 'test@example.com' }
        mockVerifyIdToken.mockResolvedValue(decoded)

        const result = await verifyToken('valid-token')
        expect(result).toEqual(decoded)
        expect(mockVerifyIdToken).toHaveBeenCalledWith('valid-token')
    })

    it('returns null on invalid token', async () => {
        mockVerifyIdToken.mockRejectedValue(new Error('Invalid token'))

        const result = await verifyToken('bad-token')
        expect(result).toBeNull()
    })

    it('returns null on expired token', async () => {
        mockVerifyIdToken.mockRejectedValue(new Error('Token expired'))

        const result = await verifyToken('expired-token')
        expect(result).toBeNull()
    })
})