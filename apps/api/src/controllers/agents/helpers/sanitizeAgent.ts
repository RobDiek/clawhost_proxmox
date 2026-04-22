const sanitizeAgent = <T extends Record<string, unknown>>(
    agent: T
): Omit<T, 'rootPassword'> & { hasRootPassword: boolean } => {
    const { rootPassword, ...safe } = agent as T & { rootPassword?: unknown }
    return {
        ...safe,
        hasRootPassword: !!rootPassword
    } as Omit<T, 'rootPassword'> & { hasRootPassword: boolean }
}

export default sanitizeAgent