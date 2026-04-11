const applyToolsDefaults = (config: Record<string, unknown>): void => {
    const tools = (config.tools || {}) as Record<string, unknown>
    if (!tools.profile) {
        tools.profile = 'full'
    }
    if (!tools.elevated) {
        tools.elevated = { enabled: true }
    }
    tools.exec = { host: 'gateway', security: 'full', ask: 'off' }
    config.tools = tools
}

export default applyToolsDefaults