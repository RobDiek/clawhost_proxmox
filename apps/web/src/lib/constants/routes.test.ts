import { ROUTES } from '@/lib/constants'
import { PATHS } from '@/lib'

describe('ROUTES', () => {
    it('HOME is /', () => {
        expect(ROUTES.HOME).toBe('/')
    })

    it('all non-HOME routes start with /', () => {
        const entries = Object.entries(ROUTES).filter(([key]) => key !== 'HOME')
        for (const [, value] of entries) {
            expect(value.startsWith('/')).toBe(true)
        }
    })

    it('routes are derived from PATHS', () => {
        expect(ROUTES.LOGIN).toBe(`/${PATHS.LOGIN}`)
        expect(ROUTES.CLAWS).toBe(`/${PATHS.CLAWS}`)
        expect(ROUTES.BLOG).toBe(`/${PATHS.BLOG}`)
        expect(ROUTES.TERMS).toBe(`/${PATHS.TERMS}`)
        expect(ROUTES.PRIVACY).toBe(`/${PATHS.PRIVACY}`)
    })

    it('BLOG_POST has slug parameter', () => {
        expect(ROUTES.BLOG_POST).toBe(`/${PATHS.BLOG}/:slug`)
    })
})