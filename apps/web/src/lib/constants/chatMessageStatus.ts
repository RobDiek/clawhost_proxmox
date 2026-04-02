const CHAT_MESSAGE_STATUS = {
    COMPLETE: 'complete',
    STREAMING: 'streaming',
    ERROR: 'error',
    ABORTED: 'aborted'
} as const

export default CHAT_MESSAGE_STATUS