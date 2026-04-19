/**
 * Bayesian A/B analyzer — pure TypeScript, no external deps.
 *
 * For proportion-based metrics (CTR, conversion_rate, hook_rate):
 *   Posterior for each variant = Beta(alpha=1+successes, beta=1+failures)
 *   Monte Carlo sample 10k times to compute P(variant_i is best).
 *
 * For continuous metrics (ROAS):
 *   Simpler t-approximation: log-normal sample mean comparison.
 *   Returns P(B > A) under normal-approx on log(ROAS).
 *
 * Why Bayesian vs p-values:
 *   - Interpretable: "83% chance B beats A" is what stakeholders want
 *   - Stable for small samples (weakly-informative prior = Uniform[0,1])
 *   - No multiple-comparisons correction headache
 *
 * Conclude thresholds (typical): P > 0.95 clear winner, P < 0.70 inconclusive.
 */

export interface ProportionSample {
    successes: number   // clicks for CTR, conversions for CVR
    total: number       // impressions for CTR, clicks for CVR
}

export interface ContinuousSample {
    mean: number        // e.g. average ROAS
    nSamples: number    // how many days/observations
    stdDev?: number     // optional — if known
}

export interface VariantPosterior {
    variantId: string
    pBest: number              // P(this variant is highest) — one value per variant summing to 1
    pBeatsControl?: number      // P(this variant beats the control), if control defined
    mean: number                // point estimate
    ci95: [number, number]      // 95% credible interval
    sampleSize: number
}

export interface ABResult {
    winnerId: string | null
    winnerPBeatsAll: number     // P winner is best — 0 if no winner
    isDecisive: boolean          // pBest >= 0.95 OR pBest <= 0.05 (clear direction)
    posteriors: VariantPosterior[]
    metric: 'ctr' | 'roas' | 'hook_rate' | 'conversion_rate'
    liftVsControlPct: number | null    // winner mean vs control mean, in % (null if no control)
    sampleCount: number
}

const MC_SAMPLES = 10_000

// ═══════════════════════════════════════════════════════════════════════════
// Main entry — analyze N variants on a proportion metric
// ═══════════════════════════════════════════════════════════════════════════

export function analyzeProportion(
    variants: Array<{ id: string; data: ProportionSample }>,
    controlId: string | null,
    metric: ABResult['metric'],
): ABResult {
    const n = variants.length
    if (n < 2) {
        return {
            winnerId: null, winnerPBeatsAll: 0, isDecisive: false, posteriors: [], metric,
            liftVsControlPct: null, sampleCount: 0,
        }
    }

    // Sample Beta posterior for each variant
    const samples: number[][] = variants.map(v => {
        const a = 1 + v.data.successes
        const b = 1 + v.data.total - v.data.successes
        return sampleBeta(a, b, MC_SAMPLES)
    })

    // For each MC iteration, find the winner — count wins per variant
    const wins = new Array(n).fill(0)
    for (let i = 0; i < MC_SAMPLES; i++) {
        let bestIdx = 0
        let bestVal = samples[0][i]
        for (let v = 1; v < n; v++) {
            if (samples[v][i] > bestVal) { bestVal = samples[v][i]; bestIdx = v }
        }
        wins[bestIdx]++
    }

    // P(variant is best) normalized
    const pBest = wins.map(w => w / MC_SAMPLES)

    // P(variant beats control) — for each variant vs control separately
    let pBeatsControl: number[] | null = null
    let controlMean = 0
    if (controlId) {
        const ctrlIdx = variants.findIndex(v => v.id === controlId)
        if (ctrlIdx >= 0) {
            controlMean = samples[ctrlIdx].reduce((s, x) => s + x, 0) / MC_SAMPLES
            pBeatsControl = variants.map((_, vi) => {
                if (vi === ctrlIdx) return 0
                let cnt = 0
                for (let i = 0; i < MC_SAMPLES; i++) {
                    if (samples[vi][i] > samples[ctrlIdx][i]) cnt++
                }
                return cnt / MC_SAMPLES
            })
        }
    }

    // Per-variant means + 95% CI
    const posteriors: VariantPosterior[] = variants.map((v, vi) => {
        const s = samples[vi]
        const sorted = [...s].sort((a, b) => a - b)
        const mean = s.reduce((sum, x) => sum + x, 0) / s.length
        const ci95: [number, number] = [
            sorted[Math.floor(s.length * 0.025)],
            sorted[Math.floor(s.length * 0.975)],
        ]
        return {
            variantId: v.id,
            pBest: pBest[vi],
            pBeatsControl: pBeatsControl?.[vi],
            mean,
            ci95,
            sampleSize: v.data.total,
        }
    })

    // Winner = variant with highest pBest
    let winnerIdx = 0
    for (let i = 1; i < n; i++) if (pBest[i] > pBest[winnerIdx]) winnerIdx = i
    const winnerPBest = pBest[winnerIdx]
    const winnerId = winnerPBest >= 0.70 ? variants[winnerIdx].id : null
    const isDecisive = winnerPBest >= 0.95

    let liftVsControlPct: number | null = null
    if (controlMean > 0 && winnerId && winnerId !== controlId) {
        liftVsControlPct = ((posteriors[winnerIdx].mean - controlMean) / controlMean) * 100
    }

    return {
        winnerId,
        winnerPBeatsAll: winnerPBest,
        isDecisive,
        posteriors,
        metric,
        liftVsControlPct,
        sampleCount: variants.reduce((s, v) => s + v.data.total, 0),
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// Continuous metric (ROAS) — log-normal approximation
// ═══════════════════════════════════════════════════════════════════════════

export function analyzeContinuous(
    variants: Array<{ id: string; data: ContinuousSample }>,
    controlId: string | null,
    metric: ABResult['metric'],
): ABResult {
    const n = variants.length
    if (n < 2) {
        return {
            winnerId: null, winnerPBeatsAll: 0, isDecisive: false, posteriors: [], metric,
            liftVsControlPct: null, sampleCount: 0,
        }
    }

    // For each variant, sample from a log-normal posterior on mean
    // Prior: weakly informative on log-mean (assume log-mean ~ Normal(0, 10))
    // Likelihood: x_bar ~ Normal(true_mean, sigma/sqrt(n))
    // Posterior on log-mean: approx Normal(log(sample_mean), sigma_log/sqrt(n))
    const samples: number[][] = variants.map(v => {
        const mean = Math.max(v.data.mean, 0.0001)   // avoid log(0)
        const logMean = Math.log(mean)
        // If stdDev not provided, estimate from mean (CV ~ 1.0 for ROAS typical)
        const logStd = v.data.stdDev ? Math.log(1 + v.data.stdDev / mean) : 0.5
        const nEff = Math.max(v.data.nSamples, 1)
        const logMeanSE = logStd / Math.sqrt(nEff)

        const samples: number[] = new Array(MC_SAMPLES)
        for (let i = 0; i < MC_SAMPLES; i++) {
            const logSample = logMean + sampleStdNormal() * logMeanSE
            samples[i] = Math.exp(logSample)
        }
        return samples
    })

    const wins = new Array(n).fill(0)
    for (let i = 0; i < MC_SAMPLES; i++) {
        let bestIdx = 0
        let bestVal = samples[0][i]
        for (let v = 1; v < n; v++) {
            if (samples[v][i] > bestVal) { bestVal = samples[v][i]; bestIdx = v }
        }
        wins[bestIdx]++
    }
    const pBest = wins.map(w => w / MC_SAMPLES)

    let pBeatsControl: number[] | null = null
    let controlMean = 0
    if (controlId) {
        const ctrlIdx = variants.findIndex(v => v.id === controlId)
        if (ctrlIdx >= 0) {
            controlMean = samples[ctrlIdx].reduce((s, x) => s + x, 0) / MC_SAMPLES
            pBeatsControl = variants.map((_, vi) => {
                if (vi === ctrlIdx) return 0
                let cnt = 0
                for (let i = 0; i < MC_SAMPLES; i++) {
                    if (samples[vi][i] > samples[ctrlIdx][i]) cnt++
                }
                return cnt / MC_SAMPLES
            })
        }
    }

    const posteriors: VariantPosterior[] = variants.map((v, vi) => {
        const s = samples[vi]
        const sorted = [...s].sort((a, b) => a - b)
        const mean = s.reduce((sum, x) => sum + x, 0) / s.length
        return {
            variantId: v.id,
            pBest: pBest[vi],
            pBeatsControl: pBeatsControl?.[vi],
            mean,
            ci95: [sorted[Math.floor(s.length * 0.025)], sorted[Math.floor(s.length * 0.975)]],
            sampleSize: v.data.nSamples,
        }
    })

    let winnerIdx = 0
    for (let i = 1; i < n; i++) if (pBest[i] > pBest[winnerIdx]) winnerIdx = i
    const winnerPBest = pBest[winnerIdx]
    const winnerId = winnerPBest >= 0.70 ? variants[winnerIdx].id : null
    const isDecisive = winnerPBest >= 0.95

    let liftVsControlPct: number | null = null
    if (controlMean > 0 && winnerId && winnerId !== controlId) {
        liftVsControlPct = ((posteriors[winnerIdx].mean - controlMean) / controlMean) * 100
    }

    return {
        winnerId,
        winnerPBeatsAll: winnerPBest,
        isDecisive,
        posteriors,
        metric,
        liftVsControlPct,
        sampleCount: variants.reduce((s, v) => s + v.data.nSamples, 0),
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// Pure-TS Beta sampler via Gamma (Marsaglia–Tsang)
// Beta(a,b) = X / (X+Y) where X~Gamma(a,1), Y~Gamma(b,1)
// ═══════════════════════════════════════════════════════════════════════════

function sampleBeta(alpha: number, beta: number, count: number): number[] {
    const out = new Array<number>(count)
    for (let i = 0; i < count; i++) {
        const x = sampleGamma(alpha)
        const y = sampleGamma(beta)
        out[i] = x / (x + y)
    }
    return out
}

/** Marsaglia–Tsang method for Gamma(shape, rate=1). Works for shape >= 1;
 * for shape < 1 uses boosting trick. */
function sampleGamma(shape: number): number {
    if (shape < 1) {
        // Boost: Gamma(shape) = Gamma(shape+1) * U^(1/shape)
        const g = sampleGamma(shape + 1)
        const u = Math.random()
        return g * Math.pow(u, 1 / shape)
    }
    const d = shape - 1 / 3
    const c = 1 / Math.sqrt(9 * d)
    // Marsaglia–Tsang: squeeze algorithm
    while (true) {
        let x: number, v: number
        do {
            x = sampleStdNormal()
            v = 1 + c * x
        } while (v <= 0)
        v = v * v * v
        const u = Math.random()
        if (u < 1 - 0.0331 * x * x * x * x) return d * v
        if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v
    }
}

/** Box–Muller standard normal */
function sampleStdNormal(): number {
    let u = 0, v = 0
    while (u === 0) u = Math.random()
    while (v === 0) v = Math.random()
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}