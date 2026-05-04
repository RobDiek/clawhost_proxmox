const getBaseDomain = (): string => {
    const isDesktop = !!(window as unknown as { electronAPI?: unknown })
        .electronAPI
    if (isDesktop) return 'clawhost'
    const hostname = window.location.hostname
    if (hostname === 'localhost' || hostname === '127.0.0.1')
        return 'clawhost.cloud'
    return hostname
}

export default getBaseDomain