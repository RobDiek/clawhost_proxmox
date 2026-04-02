import { sanitizeClaw } from '@/controllers/claws/helpers'

describe('sanitizeClaw', () => {
    it('removes rootPassword and adds hasRootPassword: true', () => {
        const claw = { id: '1', name: 'test', rootPassword: 'secret123' }
        const result = sanitizeClaw(claw)
        expect(result).toEqual({ id: '1', name: 'test', hasRootPassword: true })
        expect('rootPassword' in result).toBe(false)
    })

    it('sets hasRootPassword to false when no password', () => {
        const claw = { id: '1', name: 'test' }
        const result = sanitizeClaw(claw)
        expect(result).toEqual({
            id: '1',
            name: 'test',
            hasRootPassword: false
        })
    })

    it('sets hasRootPassword to false for empty string password', () => {
        const claw = { id: '1', rootPassword: '' }
        const result = sanitizeClaw(claw)
        expect(result.hasRootPassword).toBe(false)
    })

    it('preserves all other fields', () => {
        const claw = {
            id: '1',
            name: 'test',
            status: 'running',
            ip: '1.2.3.4',
            rootPassword: 'pw'
        }
        const result = sanitizeClaw(claw)
        expect(result.id).toBe('1')
        expect(result.name).toBe('test')
        expect(result.status).toBe('running')
        expect(result.ip).toBe('1.2.3.4')
    })
})