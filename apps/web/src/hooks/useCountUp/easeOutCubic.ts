const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3)

export default easeOutCubic