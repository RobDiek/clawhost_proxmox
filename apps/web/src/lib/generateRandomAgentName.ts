const adjectives = [
    'swift',
    'brave',
    'calm',
    'clever',
    'gentle',
    'mighty',
    'silent',
    'golden',
    'cosmic',
    'nimble',
    'jolly',
    'witty',
    'noble',
    'vivid',
    'crisp'
]

const nouns = [
    'falcon',
    'lynx',
    'raven',
    'owl',
    'fox',
    'wolf',
    'bear',
    'crane',
    'spark',
    'frost',
    'ember',
    'cedar',
    'brook',
    'storm',
    'drift'
]

const pick = (): string => {
    const adj = adjectives[Math.floor(Math.random() * adjectives.length)]
    const noun = nouns[Math.floor(Math.random() * nouns.length)]
    return `${adj}-${noun}`
}

const generateRandomAgentName = (existingNames: string[] = []): string => {
    let name = pick()
    while (existingNames.some((n) => n.toLowerCase() === name.toLowerCase())) {
        name = pick()
    }
    return name
}

export default generateRandomAgentName