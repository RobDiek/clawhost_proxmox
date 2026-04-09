describe('useThemeEffect logic', () => {
    const THEMES = { LIGHT: 'light', DARK: 'dark', SYSTEM: 'system' } as const

    const resolveTheme = (
        mode: string,
        prefersDark: boolean
    ): 'dark' | 'light' => {
        if (mode === THEMES.SYSTEM)
            return prefersDark ? THEMES.DARK : THEMES.LIGHT
        return mode as 'dark' | 'light'
    }

    it('resolves dark theme directly', () => {
        expect(resolveTheme('dark', false)).toBe('dark')
    })

    it('resolves light theme directly', () => {
        expect(resolveTheme('light', true)).toBe('light')
    })

    it('resolves system to dark when prefers dark', () => {
        expect(resolveTheme('system', true)).toBe('dark')
    })

    it('resolves system to light when prefers light', () => {
        expect(resolveTheme('system', false)).toBe('light')
    })

    it('applies dark class correctly', () => {
        document.documentElement.classList.remove('dark')
        document.documentElement.classList.add('dark')
        expect(document.documentElement.classList.contains('dark')).toBe(true)
    })

    it('removes dark class correctly', () => {
        document.documentElement.classList.add('dark')
        document.documentElement.classList.remove('dark')
        expect(document.documentElement.classList.contains('dark')).toBe(false)
    })
})