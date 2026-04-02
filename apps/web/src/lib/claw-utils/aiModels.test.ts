import { aiModels } from '@/lib/claw-utils'

describe('aiModels', () => {
    it('is a non-empty array', () => {
        expect(Array.isArray(aiModels)).toBe(true)
        expect(aiModels.length).toBeGreaterThan(0)
    })

    it('every model has required fields', () => {
        for (const model of aiModels) {
            expect(model.id).toBeTruthy()
            expect(model.name).toBeTruthy()
            expect(model.provider).toBeTruthy()
            expect(model.envVar).toBeTruthy()
        }
    })

    it('has no duplicate ids', () => {
        const ids = aiModels.map((m) => m.id)
        expect(new Set(ids).size).toBe(ids.length)
    })

    it('includes major providers', () => {
        const providers = new Set(aiModels.map((m) => m.provider))
        expect(providers.has('Anthropic')).toBe(true)
        expect(providers.has('OpenAI')).toBe(true)
        expect(providers.has('Google')).toBe(true)
    })

    it('all envVar values end with _KEY or _TOKEN', () => {
        for (const model of aiModels) {
            expect(model.envVar).toMatch(/_(KEY|TOKEN)$/)
        }
    })
})