import { validateAgentName } from '@/lib/claw-utils'

describe('validateAgentName', () => {
    it('returns null for valid name', () => {
        expect(validateAgentName('my-agent', [])).toBeNull()
    })

    it('returns null for alphanumeric name', () => {
        expect(validateAgentName('Agent01', [])).toBeNull()
    })

    it('rejects empty name', () => {
        expect(validateAgentName('', [])).toBe('playground.agentNameRequired')
    })

    it('rejects whitespace-only name', () => {
        expect(validateAgentName('   ', [])).toBe(
            'playground.agentNameRequired'
        )
    })

    it('rejects name with spaces', () => {
        expect(validateAgentName('my agent', [])).toBe(
            'playground.agentNameInvalidChars'
        )
    })

    it('rejects name with special characters', () => {
        expect(validateAgentName('my_agent', [])).toBe(
            'playground.agentNameInvalidChars'
        )
        expect(validateAgentName('my.agent', [])).toBe(
            'playground.agentNameInvalidChars'
        )
        expect(validateAgentName('my@agent', [])).toBe(
            'playground.agentNameInvalidChars'
        )
    })

    it('allows hyphens', () => {
        expect(validateAgentName('my-agent-v2', [])).toBeNull()
    })

    it('detects duplicate names (case-insensitive)', () => {
        expect(validateAgentName('main', ['main', 'helper'])).toBe(
            'playground.agentNameDuplicate'
        )
        expect(validateAgentName('MAIN', ['main', 'helper'])).toBe(
            'playground.agentNameDuplicate'
        )
        expect(validateAgentName('Main', ['main'])).toBe(
            'playground.agentNameDuplicate'
        )
    })

    it('allows same name when it matches currentName (renaming self)', () => {
        expect(validateAgentName('main', ['main', 'helper'], 'main')).toBeNull()
    })

    it('detects duplicate even when currentName is provided', () => {
        expect(validateAgentName('helper', ['main', 'helper'], 'main')).toBe(
            'playground.agentNameDuplicate'
        )
    })

    it('allows unique name when others exist', () => {
        expect(validateAgentName('new-agent', ['main', 'helper'])).toBeNull()
    })
})