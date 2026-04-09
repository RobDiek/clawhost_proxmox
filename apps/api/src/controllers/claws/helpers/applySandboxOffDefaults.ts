const applySandboxOffDefaults = (config: Record<string, unknown>): void => {
    const agents = (config.agents || {
        defaults: {},
        list: []
    }) as Record<string, unknown>
    const defaults = (agents.defaults || {}) as Record<string, unknown>
    defaults.sandbox = { mode: 'off' }
    agents.defaults = defaults
    config.agents = agents
}

export default applySandboxOffDefaults