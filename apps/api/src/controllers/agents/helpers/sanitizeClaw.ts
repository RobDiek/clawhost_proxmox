const sanitizeClaw = <T extends Record<string, unknown>>(
    claw: T
): Omit<T, 'rootPassword'> & { hasRootPassword: boolean } => {
    const { rootPassword, ...safe } = claw as T & { rootPassword?: unknown }
    return {
        ...safe,
        hasRootPassword: !!rootPassword
    } as Omit<T, 'rootPassword'> & { hasRootPassword: boolean }
}

export default sanitizeClaw