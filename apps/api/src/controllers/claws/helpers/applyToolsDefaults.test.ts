import { applyToolsDefaults } from '@/controllers/claws/helpers'

describe('applyToolsDefaults', () => {
    it('adds default profile when missing', () => {
        const config: Record<string, unknown> = {}
        applyToolsDefaults(config)
        const tools = config.tools as Record<string, unknown>
        expect(tools.profile).toBe('full')
    })

    it('preserves existing profile', () => {
        const config: Record<string, unknown> = {
            tools: { profile: 'minimal' }
        }
        applyToolsDefaults(config)
        const tools = config.tools as Record<string, unknown>
        expect(tools.profile).toBe('minimal')
    })

    it('adds default elevated when missing', () => {
        const config: Record<string, unknown> = {}
        applyToolsDefaults(config)
        const tools = config.tools as Record<string, unknown>
        expect(tools.elevated).toEqual({ enabled: true })
    })

    it('preserves existing elevated', () => {
        const config: Record<string, unknown> = {
            tools: { elevated: { enabled: false } }
        }
        applyToolsDefaults(config)
        const tools = config.tools as Record<string, unknown>
        expect(tools.elevated).toEqual({ enabled: false })
    })

    it('always sets exec to gateway config', () => {
        const config: Record<string, unknown> = {
            tools: { exec: { host: 'custom' } }
        }
        applyToolsDefaults(config)
        const tools = config.tools as Record<string, unknown>
        expect(tools.exec).toEqual({
            host: 'gateway',
            security: 'full',
            ask: 'off'
        })
    })

    it('creates tools object when config has none', () => {
        const config: Record<string, unknown> = {}
        applyToolsDefaults(config)
        expect(config.tools).toBeDefined()
    })
})