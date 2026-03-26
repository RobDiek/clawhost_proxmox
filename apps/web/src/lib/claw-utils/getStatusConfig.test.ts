import { clawStatus } from '@openclaw/shared'
import { getStatusConfig } from '@/lib/claw-utils'

describe('getStatusConfig', () => {
    const config = getStatusConfig()

    it('returns a config for every claw status', () => {
        for (const status of Object.values(clawStatus)) {
            expect(config[status]).toBeDefined()
            expect(config[status].color).toBeTruthy()
            expect(config[status].bgColor).toBeTruthy()
            expect(config[status].label).toBeTruthy()
        }
    })

    it('running is green', () => {
        expect(config[clawStatus.running].color).toBe('bg-green-500')
    })

    it('stopped is red', () => {
        expect(config[clawStatus.stopped].color).toBe('bg-red-500')
    })

    it('starting has pulse', () => {
        expect(config[clawStatus.starting].pulse).toBe(true)
    })

    it('stopping has pulse', () => {
        expect(config[clawStatus.stopping].pulse).toBe(true)
    })

    it('creating is blue with pulse', () => {
        expect(config[clawStatus.creating].color).toBe('bg-blue-500')
        expect(config[clawStatus.creating].pulse).toBe(true)
    })

    it('deleting is red with pulse', () => {
        expect(config[clawStatus.deleting].color).toBe('bg-red-500')
        expect(config[clawStatus.deleting].pulse).toBe(true)
    })

    it('awaitingPayment is yellow with pulse', () => {
        expect(config[clawStatus.awaitingPayment].color).toBe('bg-yellow-500')
        expect(config[clawStatus.awaitingPayment].pulse).toBe(true)
    })

    it('unknown is gray', () => {
        expect(config[clawStatus.unknown].color).toBe('bg-gray-400')
    })

    it('running does not have pulse', () => {
        expect(config[clawStatus.running].pulse).toBeUndefined()
    })
})