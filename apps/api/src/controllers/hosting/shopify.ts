import type { Context } from 'hono'
import { ok, fail } from '@/lib/response'
import { resolveUserId, getOwnedInstance } from './authHelper'
import { resolveActiveAgent } from '@/services/agentContext'
import { setAgentIntegration } from '@/services/agentIntegrations'
import { loadShopifyConfig, probeShopify, type ShopifyCfg } from '@/services/shopify'

function normShop(raw: string): string {
    let s = (raw || '').replace(/^https?:\/\//, '').replace(/\/.*$/, '')
    if (!/\.myshopify\.com$/i.test(s)) s = `${s.replace(/\..*$/, '')}.myshopify.com`
    return s
}

// POST /hosting/instances/:id/shopify — connect a Shopify store (validates token first).
export const saveShopifyConfig = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        if (!await getOwnedInstance(instanceId, resolveUserId(c))) return fail(c, 'Instance not found', 404)
        const body = (await c.req.json<{ shopDomain?: string; accessToken?: string; apiVersion?: string }>().catch(() => ({}))) as { shopDomain?: string; accessToken?: string; apiVersion?: string }
        const shopDomain = normShop(String(body.shopDomain || ''))
        const accessToken = String(body.accessToken || '').trim()
        if (!shopDomain || !/\.myshopify\.com$/.test(shopDomain) || !accessToken) return fail(c, 'shopDomain + accessToken required', 400)
        const cfg: ShopifyCfg = { shopDomain, accessToken, apiVersion: String(body.apiVersion || '2024-10') }
        const probe = await probeShopify(cfg)
        if (!probe.ok) return fail(c, `Shopify auth failed: ${probe.error || 'invalid token/domain'}`, 400)
        const agent = await resolveActiveAgent(c, instanceId)
        await setAgentIntegration(instanceId, 'mt', 'shopify', { shopDomain, accessToken, apiVersion: cfg.apiVersion }, 'connected', agent?.id)
        return ok(c, { shopDomain, shopName: probe.shopName }, `חנות Shopify "${probe.shopName}" חוברה בהצלחה`)
    } catch (err) { return fail(c, (err as Error).message, 500) }
}

// GET /hosting/instances/:id/shopify/status
export const getShopifyStatus = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        if (!await getOwnedInstance(instanceId, resolveUserId(c))) return fail(c, 'Instance not found', 404)
        const agent = await resolveActiveAgent(c, instanceId)
        const cfg = await loadShopifyConfig(instanceId, agent?.id)
        if (!cfg) return ok(c, { connected: false }, 'Shopify לא מחובר')
        const probe = await probeShopify(cfg)
        return ok(c, { connected: true, shopDomain: cfg.shopDomain, shopName: probe.shopName, live: probe.ok }, probe.ok ? 'מחובר' : 'מחובר (אך הטוקן לא תקף)')
    } catch (err) { return fail(c, (err as Error).message, 500) }
}

// POST /hosting/instances/:id/shopify/test
export const testShopify = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        if (!await getOwnedInstance(instanceId, resolveUserId(c))) return fail(c, 'Instance not found', 404)
        const agent = await resolveActiveAgent(c, instanceId)
        const cfg = await loadShopifyConfig(instanceId, agent?.id)
        if (!cfg) return fail(c, 'Shopify לא מחובר', 400)
        const probe = await probeShopify(cfg)
        return probe.ok ? ok(c, { shopName: probe.shopName }, `מחובר לחנות ${probe.shopName}`) : fail(c, probe.error || 'token invalid', 400)
    } catch (err) { return fail(c, (err as Error).message, 500) }
}

// DELETE /hosting/instances/:id/shopify
export const disconnectShopify = async (c: Context) => {
    try {
        const instanceId = c.req.param('id')
        if (!await getOwnedInstance(instanceId, resolveUserId(c))) return fail(c, 'Instance not found', 404)
        const agent = await resolveActiveAgent(c, instanceId)
        await setAgentIntegration(instanceId, 'mt', 'shopify', {}, 'disconnected', agent?.id)
        return ok(c, { connected: false }, 'Shopify נותק')
    } catch (err) { return fail(c, (err as Error).message, 500) }
}