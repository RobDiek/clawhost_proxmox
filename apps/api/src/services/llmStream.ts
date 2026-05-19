/**
 * Anthropic streaming SSE client — shared across all long-output Opus/Sonnet
 * generators (monthlyPlanGenerator, mazhirMediaPlan, mazhirAudit, future ones).
 *
 * Why streaming: undici's default 5-minute HeadersTimeout fires when
 * Anthropic queues long generations (Hebrew + 32K maxTokens regularly
 * exceeds 5 min before first byte). Streaming sends headers immediately
 * and we accumulate text_delta chunks as they arrive — bypasses the
 * headers-timeout entirely.
 *
 * Anthropic SSE events handled:
 *   message_start         (captures input_tokens)
 *   content_block_delta   (text accumulation)
 *   message_delta         (stop_reason, output_tokens)
 *   error                 (propagates Anthropic error)
 *
 * Progress logs every 60s during long generations.
 */

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'

export interface LlmStreamArgs {
    apiKey: string
    model: string
    system: string
    user: string
    maxTokens?: number    // default 32000 — non-streaming Anthropic hard cap is ~32K for Opus 4.7
    timeoutMs?: number    // default 20 min — Hebrew + 32K can run 8-18min
    label?: string        // log prefix for distinguishing concurrent calls
}

export async function callOpusStream(args: LlmStreamArgs): Promise<string> {
    const label = args.label || 'callOpusStream'
    const body = JSON.stringify({
        model: args.model,
        max_tokens: args.maxTokens || 32000,
        system: args.system,
        messages: [{ role: 'user', content: args.user }],
        stream: true,
    })
    console.log(`[${label}] STREAM POST ${ANTHROPIC_URL} model=${args.model} max_tokens=${args.maxTokens} bodyLen=${body.length}`)
    const t0 = Date.now()
    let res: Response
    try {
        // 32K is the practical max for Opus 4.7 streaming without beta header.
        // The output-128k-2025-02-19 beta header is for Sonnet 3.5; on Opus 4.7
        // it returns TLS terminated. If/when Anthropic ships an Opus 4.7+
        // extended-output beta, swap header here.
        const headers: Record<string, string> = {
            'x-api-key': args.apiKey,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
            'accept': 'text/event-stream',
        }
        res = await fetch(ANTHROPIC_URL, {
            method: 'POST',
            headers,
            body,
            signal: AbortSignal.timeout(args.timeoutMs || 1200000),
        })
    } catch (err) {
        const e = err as any
        console.error(`[${label}] fetch threw before stream open. cause=${e?.cause?.message || e?.cause?.code || '(none)'}`)
        throw new Error(`Anthropic stream open failed: ${e.message}`)
    }
    if (!res.ok) {
        const t = await res.text().catch(() => '')
        console.error(`[${label}] HTTP ${res.status} body=${t.slice(0, 1000)}`)
        throw new Error(`Opus ${res.status}: ${t.slice(0, 400)}`)
    }
    if (!res.body) throw new Error('Anthropic stream returned no body')

    const reader = (res.body as any).getReader()
    const decoder = new TextDecoder('utf-8')
    let buffer = ''
    let assembled = ''
    let lastProgressLog = Date.now()
    let stopReason: string | undefined
    let inputTokens: number | undefined
    let outputTokens: number | undefined
    while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const messages = buffer.split('\n\n')
        buffer = messages.pop() || ''
        for (const msg of messages) {
            const lines = msg.split('\n')
            let eventName = ''
            let dataStr = ''
            for (const line of lines) {
                if (line.startsWith('event:')) eventName = line.slice(6).trim()
                else if (line.startsWith('data:')) dataStr = line.slice(5).trim()
            }
            if (!dataStr) continue
            let payload: any
            try { payload = JSON.parse(dataStr) } catch { continue }
            switch (eventName) {
                case 'content_block_delta':
                    if (payload?.delta?.type === 'text_delta' && typeof payload.delta.text === 'string') {
                        assembled += payload.delta.text
                    }
                    break
                case 'message_delta':
                    if (payload?.delta?.stop_reason) stopReason = payload.delta.stop_reason
                    if (payload?.usage?.output_tokens) outputTokens = payload.usage.output_tokens
                    break
                case 'message_start':
                    if (payload?.message?.usage?.input_tokens) inputTokens = payload.message.usage.input_tokens
                    break
                case 'error':
                    throw new Error(`Anthropic stream error: ${JSON.stringify(payload).slice(0, 400)}`)
            }
        }
        if (Date.now() - lastProgressLog > 60000) {
            const elapsed = Math.round((Date.now() - t0) / 1000)
            console.log(`[${label}] stream progress: ${elapsed}s elapsed, ${assembled.length} chars assembled`)
            lastProgressLog = Date.now()
        }
    }
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
    console.log(`[${label}] stream done: ${elapsed}s, ${assembled.length} chars, stop=${stopReason || '?'}, in=${inputTokens || '?'} out=${outputTokens || '?'}`)
    if (!assembled) throw new Error('Opus stream produced no text')
    return assembled
}