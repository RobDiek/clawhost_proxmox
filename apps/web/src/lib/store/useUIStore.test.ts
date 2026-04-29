import { useUIStore } from '@/lib/store'

describe('useUIStore', () => {
    beforeEach(() => {
        useUIStore.setState({
            toast: null
        })
    })

    it('has correct initial state', () => {
        const state = useUIStore.getState()
        expect(state.toast).toBeNull()
    })

    it('shows toast with defaults', () => {
        useUIStore.getState().showToast('Hello')
        const toast = useUIStore.getState().toast
        expect(toast).toEqual({
            message: 'Hello',
            type: 'info',
            duration: 5000
        })
    })

    it('shows toast with custom type and duration', () => {
        useUIStore.getState().showToast('Error!', 'error', 3000)
        const toast = useUIStore.getState().toast
        expect(toast).toEqual({
            message: 'Error!',
            type: 'error',
            duration: 3000
        })
    })

    it('hides toast', () => {
        useUIStore.getState().showToast('msg')
        useUIStore.getState().hideToast()
        expect(useUIStore.getState().toast).toBeNull()
    })
})