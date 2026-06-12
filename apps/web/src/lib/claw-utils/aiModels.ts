import type { AIModelOption } from '@/ts/Interfaces'

const aiModels: AIModelOption[] = [
    {
        id: 'anthropic/claude-opus-4-8',
        name: 'Claude Opus 4.8',
        provider: 'Anthropic',
        envVar: 'ANTHROPIC_API_KEY'
    },
    {
        id: 'anthropic/claude-sonnet-4-6',
        name: 'Claude Sonnet 4.6',
        provider: 'Anthropic',
        envVar: 'ANTHROPIC_API_KEY'
    },
    {
        id: 'anthropic/claude-haiku-4-5',
        name: 'Claude Haiku 4.5',
        provider: 'Anthropic',
        envVar: 'ANTHROPIC_API_KEY'
    },
    {
        id: 'openai/gpt-5.1-codex',
        name: 'GPT-5.1 Codex',
        provider: 'OpenAI',
        envVar: 'OPENAI_API_KEY'
    },
    {
        id: 'openai/gpt-4o',
        name: 'GPT-4o',
        provider: 'OpenAI',
        envVar: 'OPENAI_API_KEY'
    },
    {
        id: 'openai/gpt-4o-mini',
        name: 'GPT-4o Mini',
        provider: 'OpenAI',
        envVar: 'OPENAI_API_KEY'
    },
    {
        id: 'openai/o3-mini',
        name: 'o3-mini',
        provider: 'OpenAI',
        envVar: 'OPENAI_API_KEY'
    },
    {
        id: 'google/gemini-3-pro-preview',
        name: 'Gemini 3 Pro',
        provider: 'Google',
        envVar: 'GEMINI_API_KEY'
    },
    {
        id: 'google/gemini-2.0-flash',
        name: 'Gemini 2.0 Flash',
        provider: 'Google',
        envVar: 'GEMINI_API_KEY'
    },
    {
        id: 'xai/grok-3',
        name: 'Grok 3',
        provider: 'xAI',
        envVar: 'XAI_API_KEY'
    },
    {
        id: 'xai/grok-3-mini',
        name: 'Grok 3 Mini',
        provider: 'xAI',
        envVar: 'XAI_API_KEY'
    },
    {
        id: 'groq/llama-4-maverick-17b-128e-instruct',
        name: 'Llama 4 Maverick',
        provider: 'Groq',
        envVar: 'GROQ_API_KEY'
    },
    {
        id: 'groq/llama-4-scout-17b-16e-instruct',
        name: 'Llama 4 Scout',
        provider: 'Groq',
        envVar: 'GROQ_API_KEY'
    },
    {
        id: 'cerebras/llama-4-scout-17b-16e-instruct',
        name: 'Llama 4 Scout',
        provider: 'Cerebras',
        envVar: 'CEREBRAS_API_KEY'
    },
    {
        id: 'mistral/mistral-large-latest',
        name: 'Mistral Large',
        provider: 'Mistral',
        envVar: 'MISTRAL_API_KEY'
    },
    {
        id: 'mistral/codestral-latest',
        name: 'Codestral',
        provider: 'Mistral',
        envVar: 'MISTRAL_API_KEY'
    },
    {
        id: 'opencode/claude-opus-4-8',
        name: 'Claude Opus 4.8',
        provider: 'OpenCode Zen',
        envVar: 'OPENCODE_API_KEY'
    },
    {
        id: 'zai/glm-4.7',
        name: 'GLM 4.7',
        provider: 'Z.AI',
        envVar: 'ZAI_API_KEY'
    },
    {
        id: 'huggingface/deepseek-ai/DeepSeek-R1',
        name: 'DeepSeek R1',
        provider: 'Hugging Face',
        envVar: 'HUGGINGFACE_HUB_TOKEN'
    },
    {
        id: 'moonshot/kimi-k2.5',
        name: 'Kimi K2.5',
        provider: 'Moonshot',
        envVar: 'MOONSHOT_API_KEY'
    },
    {
        id: 'moonshot/kimi-k2-thinking',
        name: 'Kimi K2 Thinking',
        provider: 'Moonshot',
        envVar: 'MOONSHOT_API_KEY'
    },
    {
        id: 'moonshot/kimi-k2-turbo-preview',
        name: 'Kimi K2 Turbo',
        provider: 'Moonshot',
        envVar: 'MOONSHOT_API_KEY'
    },
    {
        id: 'kimi-coding/k2p5',
        name: 'Kimi Coding K2.5',
        provider: 'Kimi Coding',
        envVar: 'KIMI_API_KEY'
    },
    {
        id: 'synthetic/hf:MiniMaxAI/MiniMax-M2.1',
        name: 'MiniMax M2.1',
        provider: 'Synthetic',
        envVar: 'SYNTHETIC_API_KEY'
    },
    {
        id: 'minimax/MiniMax-M2.1',
        name: 'MiniMax M2.1',
        provider: 'MiniMax',
        envVar: 'MINIMAX_API_KEY'
    },
    {
        id: 'vercel-ai-gateway/anthropic/claude-opus-4.8',
        name: 'Claude Opus 4.8',
        provider: 'Vercel AI Gateway',
        envVar: 'AI_GATEWAY_API_KEY'
    },
    {
        id: 'github-copilot/gpt-4o',
        name: 'GPT-4o',
        provider: 'GitHub Copilot',
        envVar: 'COPILOT_GITHUB_TOKEN'
    },
    {
        id: 'openrouter/anthropic/claude-opus-4-8',
        name: 'Claude Opus 4.8',
        provider: 'OpenRouter',
        envVar: 'OPENROUTER_API_KEY'
    },
    {
        id: 'openrouter/anthropic/claude-sonnet-4-6',
        name: 'Claude Sonnet 4.6',
        provider: 'OpenRouter',
        envVar: 'OPENROUTER_API_KEY'
    },
    {
        id: 'openrouter/openai/gpt-5.1-codex',
        name: 'GPT-5.1 Codex',
        provider: 'OpenRouter',
        envVar: 'OPENROUTER_API_KEY'
    },
    {
        id: 'openrouter/google/gemini-3-pro-preview',
        name: 'Gemini 3 Pro',
        provider: 'OpenRouter',
        envVar: 'OPENROUTER_API_KEY'
    }
]

export default aiModels