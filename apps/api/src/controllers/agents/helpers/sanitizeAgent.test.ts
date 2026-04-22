import { sanitizeAgent } from '@/controllers/agents/helpers'

describe('sanitizeAgent', () => {
    it('removes rootPassword and adds hasRootPassword: true', () => {
        const agent = { id: '1', name: 'test', rootPassword: 'secret123' }
        const result = sanitizeAgent(agent)
        expect(result).toEqual({ id: '1', name: 'test', hasRootPassword: true })
        expect('rootPassword' in result).toBe(false)
    })

    it('sets hasRootPassword to false when no password', () => {
        const agent = { id: '1', name: 'test' }
        const result = sanitizeAgent(agent)
        expect(result).toEqual({
            id: '1',
            name: 'test',
            hasRootPassword: false
        })
    })

    it('sets hasRootPassword to false for empty string password', () => {
        const agent = { id: '1', rootPassword: '' }
        const result = sanitizeAgent(agent)
        expect(result.hasRootPassword).toBe(false)
    })

    it('preserves all other fields', () => {
        const agent = {
            id: '1',
            name: 'test',
            status: 'running',
            ip: '1.2.3.4',
            rootPassword: 'pw'
        }
        const result = sanitizeAgent(agent)
        expect(result.id).toBe('1')
        expect(result.name).toBe('test')
        expect(result.status).toBe('running')
        expect(result.ip).toBe('1.2.3.4')
    })
})