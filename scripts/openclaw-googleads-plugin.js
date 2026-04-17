/**
 * openclaw-googleads — OpenClaw MCP plugin for Google Ads
 *
 * Purpose: expose Google Ads campaign/ad-group/ad/keyword management tools
 * to agents (shaliach, menateach, ayat). Safety-first: all WRITE tools
 * produce DRAFTS in approval queue. Actual Google API calls happen ONLY
 * after user approval via dashboard.
 *
 * Tools:
 *   — Draft tools (safe, no live API):
 *   draft_campaign        — structured campaign plan (name, budget, goals, targeting)
 *   draft_ad_group        — keyword theme group within a campaign
 *   draft_ad              — headlines/descriptions/URLs for a text ad
 *   draft_keywords        — keyword list with match types + max CPC
 *
 *   — Read tools (require connected Google Ads + developer token):
 *   list_campaigns        — all campaigns + status
 *   get_campaign_metrics  — impressions/clicks/CPC/CTR/cost/conversions
 *   list_keyword_performance — keyword-level metrics
 *
 *   — Control tools (require approval, not yet enabled):
 *   pause_campaign, resume_campaign — state transitions (draft-queued for approval)
 *
 * Output format: each draft tool returns `{ok: true, draft: {...}, approvalRequired: true}`.
 * The agent is expected to write this into its session response, which outputSync
 * classifies as `gads_campaign_draft` / `gads_adgroup_draft` / `gads_ad_draft` and
 * surfaces to the approval queue.
 *
 * License: MIT for our plugin. Google Ads API is Google's own TOS (requires
 * developer token + OAuth). No embedding of proprietary Google code.
 */

module.exports = {
  name: 'openclaw-googleads',
  version: '0.1.0',
  config: {
    // Optional — filled after Developer Token approval + OAuth connect.
    // Draft tools work WITHOUT these. Read/control tools require them.
    clientId:        { type: 'string', secret: true, description: 'Google OAuth Client ID' },
    clientSecret:    { type: 'string', secret: true, description: 'Google OAuth Client Secret' },
    refreshToken:    { type: 'string', secret: true, description: 'OAuth refresh_token (from Google OAuth flow)' },
    developerToken:  { type: 'string', secret: true, description: 'Google Ads Developer Token (separate approval)' },
    customerId:      { type: 'string', description: 'Google Ads Customer ID (10-digit, no dashes)' },
    loginCustomerId: { type: 'string', description: 'Manager Account ID if using MCC (optional)' },
  },

  tools: {
    // ── DRAFT TOOLS (safe, no API calls) ────────────────────────────────

    draft_campaign: {
      description: 'Draft a new Google Ads campaign. Returns structured plan for user approval. NO live API call — this is a draft only.',
      parameters: {
        type: 'object',
        properties: {
          name:             { type: 'string', description: 'Campaign name (internal label, e.g. "2026-Q1-AEO-BOFU")' },
          goal:             { type: 'string', enum: ['leads', 'sales', 'traffic', 'awareness', 'app_installs'], description: 'Campaign objective' },
          type:             { type: 'string', enum: ['search', 'performance_max', 'display', 'video'], description: 'Campaign type' },
          dailyBudgetIls:   { type: 'number', description: 'Daily budget in ILS' },
          biddingStrategy:  { type: 'string', enum: ['maximize_conversions', 'target_cpa', 'target_roas', 'manual_cpc'], description: 'Bidding strategy' },
          targetCpaIls:     { type: 'number', description: 'Target CPA in ILS (if strategy=target_cpa)' },
          targetRoas:       { type: 'number', description: 'Target ROAS % (if strategy=target_roas)' },
          locations:        { type: 'array', items: { type: 'string' }, description: 'Geo targeting — Israel cities or regions' },
          languages:        { type: 'array', items: { type: 'string' }, description: 'Languages (he, en, ar)' },
          startDate:        { type: 'string', description: 'YYYY-MM-DD (optional, default today)' },
          endDate:          { type: 'string', description: 'YYYY-MM-DD (optional, open-ended by default)' },
          rationale:        { type: 'string', description: 'Why this campaign, in Hebrew — tied to strategy/persona/pillar' },
        },
        required: ['name', 'goal', 'type', 'dailyBudgetIls', 'biddingStrategy', 'rationale']
      },
      handler: async (args) => {
        // Validate structure + return draft object for agent to include in its output
        const draft = {
          _type: 'gads_campaign_draft',
          name: args.name,
          goal: args.goal,
          type: args.type,
          dailyBudgetIls: args.dailyBudgetIls,
          monthlyBudgetEstimateIls: Math.round(args.dailyBudgetIls * 30.4),
          biddingStrategy: args.biddingStrategy,
          targetCpaIls: args.targetCpaIls || null,
          targetRoas: args.targetRoas || null,
          locations: args.locations || ['Israel'],
          languages: args.languages || ['he'],
          startDate: args.startDate || new Date().toISOString().slice(0, 10),
          endDate: args.endDate || null,
          rationale: args.rationale,
          createdAt: new Date().toISOString(),
        }
        return {
          ok: true,
          draft,
          approvalRequired: true,
          note: 'כתוב את הטיוטה בפלט שלך — המשתמש יאשר דרך תור האישורים בדשבורד'
        }
      }
    },

    draft_ad_group: {
      description: 'Draft an ad group within a campaign. Contains the theme + keywords + ads.',
      parameters: {
        type: 'object',
        properties: {
          campaignName:    { type: 'string', description: 'Parent campaign name (must match a draft_campaign name)' },
          name:            { type: 'string', description: 'Ad group name' },
          theme:           { type: 'string', description: 'Keyword theme in Hebrew — describes the intent cluster' },
          maxCpcIls:       { type: 'number', description: 'Max CPC bid in ILS (only if campaign uses manual_cpc)' },
          targetAudience:  { type: 'string', description: 'Target persona from strategy' },
        },
        required: ['campaignName', 'name', 'theme']
      },
      handler: async (args) => {
        const draft = {
          _type: 'gads_adgroup_draft',
          campaignName: args.campaignName,
          name: args.name,
          theme: args.theme,
          maxCpcIls: args.maxCpcIls || null,
          targetAudience: args.targetAudience || null,
          createdAt: new Date().toISOString(),
        }
        return { ok: true, draft, approvalRequired: true }
      }
    },

    draft_keywords: {
      description: 'Draft keyword list for an ad group. Includes match types + negative exclusions.',
      parameters: {
        type: 'object',
        properties: {
          campaignName: { type: 'string' },
          adGroupName:  { type: 'string' },
          keywords: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                text:      { type: 'string', description: 'Keyword text (Hebrew or English)' },
                matchType: { type: 'string', enum: ['exact', 'phrase', 'broad'], description: 'Match type — prefer phrase for Hebrew' },
                maxCpcIls: { type: 'number', description: 'Optional per-keyword bid' },
              },
              required: ['text', 'matchType']
            }
          },
          negativeKeywords: { type: 'array', items: { type: 'string' }, description: 'Negative exclusions' }
        },
        required: ['campaignName', 'adGroupName', 'keywords']
      },
      handler: async (args) => {
        const draft = {
          _type: 'gads_keywords_draft',
          campaignName: args.campaignName,
          adGroupName: args.adGroupName,
          keywords: args.keywords,
          negativeKeywords: args.negativeKeywords || [],
          createdAt: new Date().toISOString(),
        }
        return { ok: true, draft, approvalRequired: true }
      }
    },

    draft_ad: {
      description: 'Draft a responsive search ad. Max 15 headlines (30 chars each), max 4 descriptions (90 chars each).',
      parameters: {
        type: 'object',
        properties: {
          campaignName: { type: 'string' },
          adGroupName:  { type: 'string' },
          headlines:    { type: 'array', items: { type: 'string' }, description: 'Up to 15 headlines, max 30 chars each' },
          descriptions: { type: 'array', items: { type: 'string' }, description: 'Up to 4 descriptions, max 90 chars each' },
          finalUrl:     { type: 'string', description: 'Landing page URL (must match the site domain)' },
          displayPath1: { type: 'string', description: 'Path segment in display URL (max 15 chars)' },
          displayPath2: { type: 'string', description: 'Second path segment (max 15 chars)' },
          callouts:     { type: 'array', items: { type: 'string' }, description: 'Callout extensions (25 chars each)' },
        },
        required: ['campaignName', 'adGroupName', 'headlines', 'descriptions', 'finalUrl']
      },
      handler: async (args) => {
        // Validate Google Ads constraints
        const issues = []
        if (args.headlines.length < 3) issues.push('חובה לפחות 3 כותרות (Google ממליץ 10-15)')
        if (args.headlines.length > 15) issues.push('מקסימום 15 כותרות')
        args.headlines.forEach((h, i) => { if (h.length > 30) issues.push(`כותרת ${i+1} ארוכה מ-30 תווים`) })
        if (args.descriptions.length < 2) issues.push('חובה לפחות 2 תיאורים')
        if (args.descriptions.length > 4) issues.push('מקסימום 4 תיאורים')
        args.descriptions.forEach((d, i) => { if (d.length > 90) issues.push(`תיאור ${i+1} ארוך מ-90 תווים`) })
        try { new URL(args.finalUrl) } catch { issues.push('finalUrl לא URL תקף') }

        const draft = {
          _type: 'gads_ad_draft',
          campaignName: args.campaignName,
          adGroupName: args.adGroupName,
          headlines: args.headlines,
          descriptions: args.descriptions,
          finalUrl: args.finalUrl,
          displayPath1: args.displayPath1 || null,
          displayPath2: args.displayPath2 || null,
          callouts: args.callouts || [],
          validationIssues: issues,
          createdAt: new Date().toISOString(),
        }
        return {
          ok: issues.length === 0,
          draft,
          approvalRequired: true,
          issues: issues.length > 0 ? issues : undefined,
        }
      }
    },

    // ── READ TOOLS (require configured credentials) ──────────────────────
    // Stubs for now — return guidance until developerToken + OAuth configured.

    list_campaigns: {
      description: 'List all Google Ads campaigns. Requires connected Google Ads + Developer Token.',
      parameters: { type: 'object', properties: {} },
      handler: async (_args, ctx) => {
        if (!ctx.config.developerToken || !ctx.config.customerId) {
          return {
            ok: false,
            error: 'Google Ads not fully configured — need Developer Token + Customer ID',
            howTo: 'Manager → Tools → API Center → apply for Developer Token (1-3 days approval)'
          }
        }
        // Live API call will be implemented in next iteration
        return { ok: false, error: 'Live API not yet implemented', todo: 'add google-ads-api SDK or direct REST calls' }
      }
    },

    get_campaign_metrics: {
      description: 'Get performance metrics for a campaign in a date range.',
      parameters: {
        type: 'object',
        properties: {
          campaignId: { type: 'string' },
          dateRange:  { type: 'string', enum: ['TODAY', 'YESTERDAY', 'LAST_7_DAYS', 'LAST_30_DAYS', 'THIS_MONTH', 'LAST_MONTH'] },
        },
        required: ['campaignId', 'dateRange']
      },
      handler: async (_args, _ctx) => {
        return { ok: false, error: 'Live API not yet implemented' }
      }
    },
  },
}
