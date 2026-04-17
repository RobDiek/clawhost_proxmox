/**
 * openclaw-metaads — OpenClaw MCP plugin for Meta Ads (Facebook + Instagram)
 *
 * Draft-mode: produces structured JSON for approval queue. Live API calls
 * execute only after user approval via dashboard (same safety model as Google Ads).
 *
 * Hierarchy (Meta):
 *   Campaign (objective, budget_optimization)
 *     → Ad Set (targeting, budget, placements, bid strategy)
 *       → Ad (creative: headline, body, image, CTA, URL)
 *
 * Tools:
 *   — Draft:
 *   draft_campaign   — campaign-level: objective (LEADS/SALES/TRAFFIC/...)
 *   draft_ad_set     — ad-set-level: targeting (age/gender/location/interests),
 *                      budget, schedule, optimization_goal, billing_event
 *   draft_ad         — ad-level: creative (headline + body + image URL + CTA + link)
 *
 *   — Read (require configured credentials):
 *   list_campaigns, get_campaign_insights — Phase 4b
 *
 * Note: Facebook uses different objective naming than our strategy docs.
 * Ayat/Shaliach agents should translate persona intents to Meta objectives:
 *   "lead gen" → LEADS
 *   "sales" → OUTCOME_SALES
 *   "traffic" → OUTCOME_TRAFFIC
 *   "awareness" → OUTCOME_AWARENESS
 *   "engagement" → OUTCOME_ENGAGEMENT
 *   "app installs" → OUTCOME_APP_PROMOTION
 */

module.exports = {
  name: 'openclaw-metaads',
  version: '0.1.0',
  config: {
    appId:        { type: 'string', secret: true, description: 'Meta App ID (from Facebook for Developers)' },
    appSecret:    { type: 'string', secret: true, description: 'Meta App Secret' },
    accessToken:  { type: 'string', secret: true, description: 'User access token with ads_management scope (long-lived preferred)' },
    adAccountId:  { type: 'string', description: 'Ad Account ID (without act_ prefix — e.g. 123456789)' },
    pageId:       { type: 'string', description: 'Facebook Page ID for page-linked ads' },
  },

  tools: {
    // ── DRAFT TOOLS ─────────────────────────────────────────────────────

    draft_campaign: {
      description: 'Draft a Meta Ads campaign. Returns structured plan for user approval. NO live API call.',
      parameters: {
        type: 'object',
        properties: {
          name:            { type: 'string', description: 'Campaign name (e.g. "2026-Q1-LinkedIn-Lookalike-BOFU")' },
          objective:       { type: 'string', enum: ['OUTCOME_LEADS', 'OUTCOME_SALES', 'OUTCOME_TRAFFIC', 'OUTCOME_AWARENESS', 'OUTCOME_ENGAGEMENT', 'OUTCOME_APP_PROMOTION'], description: 'Meta campaign objective (new naming, post-April 2023)' },
          budgetMode:      { type: 'string', enum: ['daily', 'lifetime'], description: 'Budget mode' },
          budgetIls:       { type: 'number', description: 'Budget in ILS (daily if mode=daily, total if mode=lifetime)' },
          bidStrategy:     { type: 'string', enum: ['LOWEST_COST_WITHOUT_CAP', 'LOWEST_COST_WITH_BID_CAP', 'COST_CAP'], description: 'Campaign-level bid strategy' },
          specialAdCategories: { type: 'array', items: { type: 'string', enum: ['CREDIT', 'EMPLOYMENT', 'HOUSING', 'ISSUES_ELECTIONS_POLITICS'] }, description: 'Required for regulated ads (leave empty for most B2B)' },
          rationale:       { type: 'string', description: 'Why this campaign — tied to strategy/persona (in Hebrew)' },
        },
        required: ['name', 'objective', 'budgetMode', 'budgetIls', 'rationale']
      },
      handler: async (args) => {
        const draft = {
          _type: 'mads_campaign_draft',
          name: args.name,
          objective: args.objective,
          budgetMode: args.budgetMode,
          budgetIls: args.budgetIls,
          monthlyBudgetEstimateIls: args.budgetMode === 'daily' ? Math.round(args.budgetIls * 30.4) : args.budgetIls,
          bidStrategy: args.bidStrategy || 'LOWEST_COST_WITHOUT_CAP',
          specialAdCategories: args.specialAdCategories || [],
          rationale: args.rationale,
          createdAt: new Date().toISOString(),
        }
        return { ok: true, draft, approvalRequired: true, note: 'כתוב את הטיוטה בפלט שלך — המשתמש יאשר בתור האישורים' }
      }
    },

    draft_ad_set: {
      description: 'Draft an Ad Set within a campaign. Targeting + schedule + optimization goal live here.',
      parameters: {
        type: 'object',
        properties: {
          campaignName:    { type: 'string', description: 'Parent campaign name (must match a draft_campaign name)' },
          name:            { type: 'string', description: 'Ad set name' },
          optimizationGoal: { type: 'string', enum: ['LINK_CLICKS', 'REACH', 'IMPRESSIONS', 'THRUPLAY', 'LEAD_GENERATION', 'CONVERSATIONS', 'OFFSITE_CONVERSIONS'], description: 'What Meta optimizes delivery for' },
          billingEvent:    { type: 'string', enum: ['IMPRESSIONS', 'LINK_CLICKS', 'THRUPLAY'], description: 'What you get billed for' },
          budgetIls:       { type: 'number', description: 'Ad-set-level daily budget in ILS (if campaign is not budget-optimized)' },
          targeting: {
            type: 'object',
            properties: {
              ageMin:         { type: 'number', description: 'Minimum age (13-65)' },
              ageMax:         { type: 'number', description: 'Maximum age (13-65)' },
              genders:        { type: 'array', items: { type: 'string', enum: ['all', 'male', 'female'] } },
              locations:      { type: 'array', items: { type: 'string' }, description: 'ISO country codes or city names ("IL", "Tel Aviv")' },
              interests:      { type: 'array', items: { type: 'string' }, description: 'Interest names — SDK will resolve to Meta targeting spec IDs' },
              customAudiences: { type: 'array', items: { type: 'string' }, description: 'Custom audience IDs (existing)' },
              lookalike:      { type: 'string', description: 'Seed audience name for lookalike creation' },
            }
          },
          placements:      { type: 'array', items: { type: 'string', enum: ['facebook_feed', 'instagram_feed', 'instagram_stories', 'facebook_reels', 'instagram_reels', 'audience_network', 'messenger_stories'] }, description: 'Where ads show — default: automatic placements if omitted' },
          startDate:       { type: 'string', description: 'YYYY-MM-DD (optional)' },
          endDate:         { type: 'string', description: 'YYYY-MM-DD (optional)' },
          targetPersona:   { type: 'string', description: 'Which persona from strategy this targets' },
        },
        required: ['campaignName', 'name', 'optimizationGoal', 'billingEvent', 'targeting']
      },
      handler: async (args) => {
        const draft = {
          _type: 'mads_adset_draft',
          campaignName: args.campaignName,
          name: args.name,
          optimizationGoal: args.optimizationGoal,
          billingEvent: args.billingEvent,
          budgetIls: args.budgetIls || null,
          targeting: args.targeting,
          placements: args.placements || ['automatic'],
          startDate: args.startDate || new Date().toISOString().slice(0, 10),
          endDate: args.endDate || null,
          targetPersona: args.targetPersona || null,
          createdAt: new Date().toISOString(),
        }
        return { ok: true, draft, approvalRequired: true }
      }
    },

    draft_ad: {
      description: 'Draft a Meta ad creative: headline + body + image/video + CTA + link.',
      parameters: {
        type: 'object',
        properties: {
          campaignName:  { type: 'string' },
          adSetName:     { type: 'string' },
          name:          { type: 'string', description: 'Ad name (internal)' },
          headline:      { type: 'string', description: 'Headline — max 40 chars recommended' },
          body:          { type: 'string', description: 'Primary text — max 125 chars recommended for feed' },
          description:   { type: 'string', description: 'Link description — max 30 chars (optional, shown under link on desktop)' },
          imageUrl:      { type: 'string', description: 'Image URL — will be uploaded to Meta via creative API' },
          linkUrl:       { type: 'string', description: 'Destination URL' },
          cta:           { type: 'string', enum: ['LEARN_MORE', 'SIGN_UP', 'SUBSCRIBE', 'SHOP_NOW', 'BOOK_NOW', 'CONTACT_US', 'DOWNLOAD', 'APPLY_NOW', 'GET_QUOTE', 'GET_OFFER'], description: 'Call to action button' },
          displayLink:   { type: 'string', description: 'Shortened display URL (optional, e.g. "flowmatic.co.il")' },
        },
        required: ['campaignName', 'adSetName', 'name', 'headline', 'body', 'imageUrl', 'linkUrl', 'cta']
      },
      handler: async (args) => {
        const issues = []
        if (args.headline.length > 40) issues.push(`כותרת ארוכה מ-40 תווים (${args.headline.length})`)
        if (args.body.length > 125)     issues.push(`טקסט עיקרי ארוך מ-125 תווים (${args.body.length})`)
        if (args.description && args.description.length > 30) issues.push(`תיאור ארוך מ-30 תווים (${args.description.length})`)
        try { new URL(args.imageUrl) } catch { issues.push('imageUrl לא URL תקף') }
        try { new URL(args.linkUrl)  } catch { issues.push('linkUrl לא URL תקף') }

        const draft = {
          _type: 'mads_ad_draft',
          campaignName: args.campaignName,
          adSetName: args.adSetName,
          name: args.name,
          headline: args.headline,
          body: args.body,
          description: args.description || '',
          imageUrl: args.imageUrl,
          linkUrl: args.linkUrl,
          cta: args.cta,
          displayLink: args.displayLink || '',
          validationIssues: issues,
          createdAt: new Date().toISOString(),
        }
        return { ok: issues.length === 0, draft, approvalRequired: true, issues: issues.length > 0 ? issues : undefined }
      }
    },

    // ── READ TOOLS (stubbed — Phase 4b) ──

    list_campaigns: {
      description: 'List all Meta ad campaigns. Requires connected access token + ad account ID.',
      parameters: { type: 'object', properties: {} },
      handler: async (_args, ctx) => {
        if (!ctx.config.accessToken || !ctx.config.adAccountId) {
          return { ok: false, error: 'Meta Ads not fully configured', howTo: 'Complete OAuth + paste Ad Account ID in dashboard Integrations' }
        }
        return { ok: false, error: 'Live API not yet implemented' }
      }
    },
  },
}
