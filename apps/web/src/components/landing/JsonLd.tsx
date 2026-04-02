import type { FC, ReactNode } from 'react'
import type { JsonLdProps } from '@/ts/Interfaces'

import { useEffect } from 'react'

const JsonLd: FC<JsonLdProps> = ({ data }): ReactNode => {
    useEffect(() => {
        const script = document.createElement('script')
        script.type = 'application/ld+json'
        script.textContent = JSON.stringify(data)
        document.head.appendChild(script)
        return () => {
            document.head.removeChild(script)
        }
    }, [data])

    return null
}

export default JsonLd