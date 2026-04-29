import easeOutCubic from '@/hooks/useCountUp/easeOutCubic'

const interpolate = (start: number, end: number, progress: number): number =>
    Math.round(start + (end - start) * easeOutCubic(progress))

export default interpolate