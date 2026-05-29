/**
 * Deferred Actions handler registry — K15.
 *
 * Handlers self-register at import time. Lookup via getHandler(kind).
 */

import type { DeferredActionHandler, DeferredActionKind } from './types'

const handlers = new Map<DeferredActionKind, DeferredActionHandler<unknown>>()

export function registerHandler<T>(kind: DeferredActionKind, handler: DeferredActionHandler<T>): void {
    handlers.set(kind, handler as DeferredActionHandler<unknown>)
}

export function getHandler(kind: DeferredActionKind): DeferredActionHandler<unknown> | undefined {
    return handlers.get(kind)
}

export function listRegisteredKinds(): DeferredActionKind[] {
    return Array.from(handlers.keys())
}