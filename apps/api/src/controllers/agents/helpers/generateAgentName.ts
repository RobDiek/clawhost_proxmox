const adjectives = [
    'cozy',
    'swift',
    'brave',
    'calm',
    'tiny',
    'wild',
    'warm',
    'cool',
    'happy',
    'lucky',
    'fuzzy',
    'snowy',
    'dusty',
    'misty',
    'sunny',
    'sleepy',
    'clever',
    'gentle',
    'mighty',
    'silent',
    'golden',
    'cosmic',
    'polar',
    'rusty',
    'nimble',
    'jolly',
    'witty',
    'noble',
    'vivid',
    'crisp'
]

const nouns = [
    'claw',
    'panda',
    'otter',
    'fox',
    'wolf',
    'bear',
    'falcon',
    'lynx',
    'raven',
    'crane',
    'pike',
    'owl',
    'hare',
    'frog',
    'moth',
    'finch',
    'cedar',
    'maple',
    'birch',
    'reef',
    'dune',
    'peak',
    'brook',
    'grove',
    'ember',
    'spark',
    'drift',
    'frost',
    'cloud',
    'storm'
]

let namePool: string[] = []

const shufflePool = () => {
    namePool = []
    for (const adj of adjectives) {
        for (const noun of nouns) {
            namePool.push(`${adj}-${noun}`)
        }
    }
    for (let i = namePool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[namePool[i], namePool[j]] = [namePool[j], namePool[i]]
    }
}

const generateAgentName = (): string => {
    if (namePool.length === 0) shufflePool()
    return namePool.pop()!
}

export default generateAgentName