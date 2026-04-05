import ENV_DEFAULTS from '@/lib/constants/envDefaults'

type EnvKey = keyof typeof ENV_DEFAULTS

const getEnv = (key: EnvKey): string => {
    const value = import.meta.env[key]
    if (value) return value
    return ENV_DEFAULTS[key]
}

export default getEnv