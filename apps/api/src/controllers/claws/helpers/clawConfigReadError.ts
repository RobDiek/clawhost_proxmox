class ClawConfigReadError extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'ClawConfigReadError'
    }
}

export default ClawConfigReadError