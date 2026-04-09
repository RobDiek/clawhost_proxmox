class ClawMissingCredentialsError extends Error {
    constructor() {
        super('Claw is missing ip or rootPassword')
        this.name = 'ClawMissingCredentialsError'
    }
}

export default ClawMissingCredentialsError