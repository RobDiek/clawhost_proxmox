const parseVersion = (raw: string): number[] => {
    const match = raw.match(/(\d{4})\.(\d{1,2})\.(\d{1,2})(?:-(\d+))?/)
    if (!match) return [0, 0, 0, 0]
    return [
        parseInt(match[1]),
        parseInt(match[2]),
        parseInt(match[3]),
        match[4] ? parseInt(match[4]) : 0
    ]
}

const SUPPORTED_VERSIONS: Record<string, string[]> = {
    channels: [
        '2026.3.28',
        '2026.3.24',
        '2026.3.23-2',
        '2026.3.23-1',
        '2026.3.23'
    ],
    skills: [
        '2026.3.28',
        '2026.3.24',
        '2026.3.23-2',
        '2026.3.23-1',
        '2026.3.23'
    ],
    bindings: [
        '2026.3.28',
        '2026.3.24',
        '2026.3.23-2',
        '2026.3.23-1',
        '2026.3.23'
    ],
    agents: [
        '2026.3.28',
        '2026.3.24',
        '2026.3.23-2',
        '2026.3.23-1',
        '2026.3.23'
    ]
}

const isFeatureSupported = (version: string, feature: string): boolean => {
    const versions = SUPPORTED_VERSIONS[feature]
    if (!versions) return false

    const current = parseVersion(version)
    if (current[0] === 0 && current[1] === 0 && current[2] === 0) return false

    return versions.some((v) => {
        const target = parseVersion(v)
        return (
            current[0] === target[0] &&
            current[1] === target[1] &&
            current[2] === target[2] &&
            current[3] === target[3]
        )
    })
}

const isVersionSupported = (version: string): boolean => {
    return Object.keys(SUPPORTED_VERSIONS).some((feature) =>
        isFeatureSupported(version, feature)
    )
}

export { SUPPORTED_VERSIONS, isFeatureSupported, isVersionSupported }