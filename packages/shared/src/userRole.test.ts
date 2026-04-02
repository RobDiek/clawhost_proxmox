import { userRole } from '#shared/index'

describe('userRole', () => {
    it('has user role', () => {
        expect(userRole.user).toBe('user')
    })

    it('has admin role', () => {
        expect(userRole.admin).toBe('admin')
    })

    it('has exactly 2 roles', () => {
        expect(Object.keys(userRole)).toHaveLength(2)
    })
})