const parseClawVersion = (raw: string): number[] => {
    const match = raw.match(/(\d{4})\.(\d{1,2})\.(\d{1,2})(?:-(\d+))?/)
    if (!match) return [0, 0, 0, 0]
    return [
        parseInt(match[1]),
        parseInt(match[2]),
        parseInt(match[3]),
        match[4] ? parseInt(match[4]) : 0
    ]
}

export default parseClawVersion