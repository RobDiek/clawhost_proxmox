import getLocale from '@/lib/getLocale'

const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString(getLocale(), {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    })
}

export default formatDate