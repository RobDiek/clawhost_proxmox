/**
 * Knowledge Base Service — RAG via pgvector.
 *
 * Handles document chunking, embedding generation, and semantic search.
 * Uses the existing Neon PostgreSQL — no extra infrastructure needed.
 *
 * Embedding: calls the HuggingFace Inference API (free tier, same model as Mem0).
 * Search: cosine similarity via raw SQL (pgvector extension).
 */

import { randomBytes } from 'crypto'
import { db } from '@/db'
import { knowledgeDocuments, knowledgeChunks } from '@/db/schema'
import { eq, and, sql } from 'drizzle-orm'

const CHUNK_SIZE = 500 // characters per chunk
const CHUNK_OVERLAP = 50
const EMBEDDING_MODEL = 'sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2'
const EMBEDDING_DIM = 384

const generateId = () => randomBytes(6).toString('hex')

// ── Chunking ──

function chunkText(text: string): string[] {
    const chunks: string[] = []
    let start = 0
    while (start < text.length) {
        const end = Math.min(start + CHUNK_SIZE, text.length)
        chunks.push(text.slice(start, end).trim())
        start = end - CHUNK_OVERLAP
        if (start >= text.length) break
    }
    return chunks.filter(c => c.length > 20) // skip tiny chunks
}

// ── Embedding via HuggingFace Inference API ──

async function getEmbedding(text: string): Promise<number[]> {
    const apiKey = process.env.HF_API_KEY || process.env.HUGGINGFACE_API_KEY
    const url = `https://api-inference.huggingface.co/pipeline/feature-extraction/${EMBEDDING_MODEL}`

    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify({ inputs: text, options: { wait_for_model: true } }),
    })

    if (!res.ok) {
        throw new Error(`HF embedding failed: ${res.status} ${await res.text()}`)
    }

    const result: unknown = await res.json()
    // HF returns [[...embedding...]] for single input
    const arr = result as number[] | number[][]
    const embedding = Array.isArray(arr[0]) ? arr[0] : arr
    return embedding as number[]
}

async function getEmbeddingBatch(texts: string[]): Promise<number[][]> {
    // Process in batches of 8 to respect rate limits
    const results: number[][] = []
    for (let i = 0; i < texts.length; i += 8) {
        const batch = texts.slice(i, i + 8)
        const embeddings = await Promise.all(batch.map(getEmbedding))
        results.push(...embeddings)
    }
    return results
}

// ── Document Ingestion ──

export async function ingestDocument(
    instanceId: string,
    filename: string,
    content: string,
    contentType: string
): Promise<{ documentId: string; chunkCount: number }> {
    const docId = generateId()

    // Truncate very large documents
    const truncated = content.slice(0, 50_000)

    // Create document record
    await db.insert(knowledgeDocuments).values({
        id: docId,
        instanceId,
        filename,
        contentType,
        rawContent: truncated,
        status: 'processing',
    })

    try {
        // Chunk the content
        const chunks = chunkText(truncated)

        // Generate embeddings
        const embeddings = await getEmbeddingBatch(chunks)

        // Insert chunks with embeddings
        const chunkRecords = chunks.map((content, i) => ({
            id: generateId(),
            documentId: docId,
            instanceId,
            chunkIndex: i,
            content,
            embedding: embeddings[i],
        }))

        if (chunkRecords.length > 0) {
            // Insert in batches of 50
            for (let i = 0; i < chunkRecords.length; i += 50) {
                await db.insert(knowledgeChunks).values(chunkRecords.slice(i, i + 50))
            }
        }

        // Update document status
        await db.update(knowledgeDocuments).set({
            chunkCount: chunks.length,
            status: 'ready',
        }).where(eq(knowledgeDocuments.id, docId))

        return { documentId: docId, chunkCount: chunks.length }
    } catch (err) {
        await db.update(knowledgeDocuments).set({ status: 'failed' })
            .where(eq(knowledgeDocuments.id, docId))
        throw err
    }
}

// ── Semantic Search ──

export async function searchKnowledge(
    instanceId: string,
    query: string,
    limit = 5
): Promise<Array<{ content: string; score: number; filename: string; documentId: string }>> {
    // Get query embedding
    const queryEmbedding = await getEmbedding(query)

    // Cosine similarity search via raw SQL
    // Since we store embeddings as jsonb (not pgvector native), we compute similarity in SQL
    const results = await db.execute(sql`
        SELECT
            kc.content,
            kc.document_id,
            kd.filename,
            (
                SELECT SUM(a * b) / (
                    SQRT(SUM(a * a)) * SQRT(SUM(b * b))
                )
                FROM unnest(ARRAY(SELECT jsonb_array_elements_text(kc.embedding)::float8)) AS a,
                     unnest(ARRAY(SELECT jsonb_array_elements_text(${JSON.stringify(queryEmbedding)}::jsonb)::float8)) AS b
            ) AS score
        FROM knowledge_chunks kc
        JOIN knowledge_documents kd ON kd.id = kc.document_id
        WHERE kc.instance_id = ${instanceId}
          AND kd.status = 'ready'
        ORDER BY score DESC
        LIMIT ${limit}
    `)

    return (results.rows as any[]).map(r => ({
        content: r.content,
        score: parseFloat(r.score) || 0,
        filename: r.filename,
        documentId: r.document_id,
    }))
}

// ── List Documents ──

export async function listDocuments(instanceId: string) {
    return db.select({
        id: knowledgeDocuments.id,
        filename: knowledgeDocuments.filename,
        contentType: knowledgeDocuments.contentType,
        chunkCount: knowledgeDocuments.chunkCount,
        status: knowledgeDocuments.status,
        createdAt: knowledgeDocuments.createdAt,
    })
    .from(knowledgeDocuments)
    .where(eq(knowledgeDocuments.instanceId, instanceId))
    .orderBy(knowledgeDocuments.createdAt)
}

// ── Delete Document ──

export async function deleteDocument(instanceId: string, documentId: string) {
    // Chunks cascade-delete via FK
    await db.delete(knowledgeDocuments)
        .where(and(
            eq(knowledgeDocuments.id, documentId),
            eq(knowledgeDocuments.instanceId, instanceId)
        ))
}

export default {
    ingestDocument,
    searchKnowledge,
    listDocuments,
    deleteDocument,
}
