import type { WebVitalsMetric, GTagWindow } from '@/ts/Interfaces'

import { onCLS, onINP, onLCP, onFCP, onTTFB } from 'web-vitals'

const reportWebVitals = (): void => {
    const sendToAnalytics = ({ name, delta, id }: WebVitalsMetric) => {
        const gtag = (window as unknown as GTagWindow).gtag
        if (typeof gtag === 'function') {
            gtag('event', name, {
                event_category: 'Web Vitals',
                value: Math.round(name === 'CLS' ? delta * 1000 : delta),
                event_label: id,
                non_interaction: true
            })
        }
    }

    onCLS(sendToAnalytics)
    onINP(sendToAnalytics)
    onLCP(sendToAnalytics)
    onFCP(sendToAnalytics)
    onTTFB(sendToAnalytics)
}

export default reportWebVitals