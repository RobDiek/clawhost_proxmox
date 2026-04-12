const fireConfetti = async (): Promise<void> => {
    const { default: confetti } = await import('canvas-confetti')
    const duration = 1250
    const end = Date.now() + duration

    const frame = (): void => {
        confetti({
            particleCount: 2,
            startVelocity: 15,
            spread: 360,
            ticks: 200,
            gravity: 0.6,
            decay: 0.94,
            origin: { x: Math.random(), y: -0.1 }
        })

        if (Date.now() < end) {
            requestAnimationFrame(frame)
        }
    }

    frame()
}

export default fireConfetti