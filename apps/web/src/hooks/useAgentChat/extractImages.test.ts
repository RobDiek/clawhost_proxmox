import extractImages from '@/hooks/useAgentChat/extractImages'

describe('extractImages', () => {
    it('returns empty array for non-array input', () => {
        expect(extractImages('string')).toEqual([])
        expect(extractImages(null)).toEqual([])
        expect(extractImages(undefined)).toEqual([])
        expect(extractImages({})).toEqual([])
    })

    it('returns empty array for empty array', () => {
        expect(extractImages([])).toEqual([])
    })

    it('filters out non-image blocks', () => {
        const content = [
            { type: 'text', text: 'hello' },
            { type: 'image', url: 'http://img.png' }
        ]
        expect(extractImages(content)).toHaveLength(1)
    })

    it('extracts image with url', () => {
        const content = [{ type: 'image', url: 'http://example.com/img.png' }]
        const result = extractImages(content)
        expect(result[0]).toEqual({
            type: 'url',
            mediaType: 'image/png',
            data: 'http://example.com/img.png'
        })
    })

    it('extracts image with url and custom media_type', () => {
        const content = [
            { type: 'image', url: 'http://img.jpg', media_type: 'image/jpeg' }
        ]
        const result = extractImages(content)
        expect(result[0].mediaType).toBe('image/jpeg')
    })

    it('extracts base64 image with data field', () => {
        const content = [
            { type: 'image', data: 'base64data', mimeType: 'image/webp' }
        ]
        const result = extractImages(content)
        expect(result[0]).toEqual({
            type: 'base64',
            mediaType: 'image/webp',
            data: 'base64data'
        })
    })

    it('extracts image with source.type url', () => {
        const content = [
            {
                type: 'image',
                source: {
                    type: 'url',
                    url: 'http://img.png',
                    media_type: 'image/png'
                }
            }
        ]
        const result = extractImages(content)
        expect(result[0]).toEqual({
            type: 'url',
            mediaType: 'image/png',
            data: 'http://img.png'
        })
    })

    it('extracts image with source.type base64', () => {
        const content = [
            {
                type: 'image',
                source: {
                    type: 'base64',
                    data: 'abcdef',
                    media_type: 'image/gif'
                }
            }
        ]
        const result = extractImages(content)
        expect(result[0]).toEqual({
            type: 'base64',
            mediaType: 'image/gif',
            data: 'abcdef'
        })
    })

    it('skips image blocks without source, url, or data', () => {
        const content = [{ type: 'image' }]
        expect(extractImages(content)).toEqual([])
    })
})