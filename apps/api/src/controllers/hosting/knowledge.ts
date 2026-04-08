/**
 * Knowledge Base Controller — RAG document management for instances.
 *
 * Upload documents, search them semantically, manage knowledge base.
 */

import type { Context } from 'hono'
import { ok, fail } from '@/lib/response'
import { resolveUserId, getOwnedInstance } from './authHelper'
import { ingestDocument, searchKnowledge, listDocuments, deleteDocument } from '@/services/knowledge'

// POST /hosting/instances/:id/knowledge/upload
// Body: { filename: string, content: string, contentType?: string }
export const uploadKnowledgeDoc = async (c: Context) => {
    try {
        const userId = resolveUserId(c)
        if (!userId) return fail(c, 'Unauthorized', 401)

        const instanceId = c.req.param('id')
        const instance = await getOwnedInstance(instanceId, userId)
        if (!instance) return fail(c, 'Instance not found', 404)

        const body = await c.req.json()
        const { filename, content, contentType } = body

        if (!filename || !content) {
            return fail(c, 'filename and content are required', 400)
        }

        if (content.length > 100_000) {
            return fail(c, 'Document too large (max 100KB text)', 400)
        }

        const result = await ingestDocument(
            instanceId,
            filename,
            content,
            contentType || 'text/plain'
        )

        return ok(c, result, `Document "${filename}" uploaded: ${result.chunkCount} chunks indexed`)
    } catch (err) {
        console.error('uploadKnowledgeDoc error:', err)
        return fail(c, 'Failed to upload document', 500)
    }
}

// POST /hosting/instances/:id/knowledge/search
// Body: { query: string, limit?: number }
export const searchKnowledgeEndpoint = async (c: Context) => {
    try {
        const userId = resolveUserId(c)
        if (!userId) return fail(c, 'Unauthorized', 401)

        const instanceId = c.req.param('id')
        const instance = await getOwnedInstance(instanceId, userId)
        if (!instance) return fail(c, 'Instance not found', 404)

        const body = await c.req.json()
        const { query, limit } = body

        if (!query) return fail(c, 'query is required', 400)

        const clampedLimit = Math.min(Math.max(parseInt(limit) || 5, 1), 20)
        const results = await searchKnowledge(instanceId, query, clampedLimit)

        return ok(c, results, `Found ${results.length} relevant chunks`)
    } catch (err) {
        console.error('searchKnowledge error:', err)
        return fail(c, 'Search failed', 500)
    }
}

// GET /hosting/instances/:id/knowledge/documents
export const listKnowledgeDocs = async (c: Context) => {
    try {
        const userId = resolveUserId(c)
        if (!userId) return fail(c, 'Unauthorized', 401)

        const instanceId = c.req.param('id')
        const instance = await getOwnedInstance(instanceId, userId)
        if (!instance) return fail(c, 'Instance not found', 404)

        const docs = await listDocuments(instanceId)
        return ok(c, docs, `${docs.length} documents`)
    } catch (err) {
        console.error('listKnowledgeDocs error:', err)
        return fail(c, 'Failed to list documents', 500)
    }
}

// DELETE /hosting/instances/:id/knowledge/:docId
export const deleteKnowledgeDoc = async (c: Context) => {
    try {
        const userId = resolveUserId(c)
        if (!userId) return fail(c, 'Unauthorized', 401)

        const instanceId = c.req.param('id')
        const instance = await getOwnedInstance(instanceId, userId)
        if (!instance) return fail(c, 'Instance not found', 404)

        const docId = c.req.param('docId')
        if (!docId) return fail(c, 'Document ID required', 400)

        await deleteDocument(instanceId, docId)
        return ok(c, null, 'Document deleted')
    } catch (err) {
        console.error('deleteKnowledgeDoc error:', err)
        return fail(c, 'Failed to delete document', 500)
    }
}
