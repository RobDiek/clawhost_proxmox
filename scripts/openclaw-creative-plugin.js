/**
 * openclaw-creative — OpenClaw MCP plugin for Yotzer Creative Agent
 *
 * Purpose: expose creative generation lifecycle tools to the yotzer agent.
 * Safety-first draft model: all generation steps produce approval-queue drafts.
 * Live API calls (fal.ai, ElevenLabs, Suno) execute ONLY after user approval.
 *
 * Lifecycle (4 HITL gates per Yotzer research):
 *   Gate 1 — draft_concept:             brief + goal → creative concept
 *   Gate 2 — draft_character_reference: concept → 4 character/brand variations
 *   Gate 3 — draft_scene_variations:    character + concept → scene grid
 *   Gate 4 — draft_final_creative:      selected scene → render spec + Hebrew overlay
 *
 * Each tool returns `{ok: true, draft: {...}, approvalRequired: true}`.
 * outputSync classifies _type as creative_{concept|character|scenes|final}_draft
 * and surfaces to the dashboard approval queue.
 *
 * BYOK: all API keys (fal.ai, ElevenLabs, Suno, Replicate) come from user config.
 * Draft tools are safe — they produce prompts + specs WITHOUT any API spend.
 *
 * Tier mapping (matches HaaS plans):
 *   draft     = Starter tier — cheap models (Nano Banana Pro image, no video)
 *   standard  = Growth tier  — image + basic video (Kling 2.5 Turbo Pro)
 *   premium   = Autopilot    — full stack (FLUX.2 Pro, Veo 3.1, ElevenLabs)
 *
 * License: MIT for plugin. External APIs follow their own TOS (BYOK model).
 */

module.exports = {
  name: 'openclaw-creative',
  version: '0.1.0',
  config: {
    falApiKey:        { type: 'string', secret: true, description: 'fal.ai API key (primary aggregator)' },
    elevenLabsApiKey: { type: 'string', secret: true, description: 'ElevenLabs API key (voice generation)' },
    sunoApiKey:       { type: 'string', secret: true, description: 'Suno API key (music generation, optional)' },
    replicateApiKey:  { type: 'string', secret: true, description: 'Replicate API key (fallback)' },
    tenantStoragePath:{ type: 'string', description: 'Tenant VPS storage path for creatives (default /opt/openclaw/creatives)' },
  },

  tools: {
    // ── GATE 1: CONCEPT ──────────────────────────────────────────────────

    draft_concept: {
      description: 'Gate 1 — Draft a creative concept from a brief. Produces hook, visual direction, CTA, format specs. NO live API — this is structured planning only.',
      parameters: {
        type: 'object',
        properties: {
          brief:           { type: 'string', description: 'What to create — product/offer/message (Hebrew OK)' },
          goal:            { type: 'string', enum: ['awareness', 'leads', 'sales', 'engagement', 'app_install', 'retention'], description: 'Marketing goal' },
          targetAudience:  { type: 'string', description: 'Persona description (from strategy entity_list or ayat research)' },
          platform:        { type: 'string', enum: ['meta_feed', 'meta_story', 'meta_reel', 'youtube_short', 'youtube_in_stream', 'google_display', 'tiktok', 'linkedin', 'static_ad'], description: 'Target platform' },
          tier:            { type: 'string', enum: ['draft', 'standard', 'premium'], description: 'Creative quality tier (maps to HaaS plan)' },
          formatType:      { type: 'string', enum: ['image', 'video', 'carousel', 'audio'], description: 'Output type' },
          brandVoice:      { type: 'string', description: 'Brand voice reference (from SOUL.md / BRAND.md)' },
          callToAction:    { type: 'string', description: 'Primary CTA in Hebrew (e.g. "הזמן עכשיו", "לפרטים נוספים")' },
          rationale:       { type: 'string', description: 'Why this concept — tied to persona pain + strategy pillar, in Hebrew' },
        },
        required: ['brief', 'goal', 'platform', 'tier', 'formatType', 'rationale']
      },
      handler: async (args) => {
        // Platform constraints (aspect ratio, duration)
        const platformSpecs = {
          meta_feed:       { aspectRatio: '1:1',  maxDurationSec: 60,   resolution: '1080x1080' },
          meta_story:      { aspectRatio: '9:16', maxDurationSec: 15,   resolution: '1080x1920' },
          meta_reel:       { aspectRatio: '9:16', maxDurationSec: 90,   resolution: '1080x1920' },
          youtube_short:   { aspectRatio: '9:16', maxDurationSec: 60,   resolution: '1080x1920' },
          youtube_in_stream:{ aspectRatio: '16:9',maxDurationSec: 30,   resolution: '1920x1080' },
          google_display:  { aspectRatio: '1.91:1',maxDurationSec: null,resolution: '1200x628'  },
          tiktok:          { aspectRatio: '9:16', maxDurationSec: 60,   resolution: '1080x1920' },
          linkedin:        { aspectRatio: '1.91:1',maxDurationSec: 30,   resolution: '1200x628'  },
          static_ad:       { aspectRatio: '1:1',  maxDurationSec: null, resolution: '1080x1080' },
        }
        const spec = platformSpecs[args.platform] || platformSpecs.meta_feed

        const draft = {
          _type: 'creative_concept_draft',
          conceptId: 'concept_' + Date.now().toString(36),
          brief: args.brief,
          goal: args.goal,
          targetAudience: args.targetAudience || null,
          platform: args.platform,
          tier: args.tier,
          formatType: args.formatType,
          aspectRatio: spec.aspectRatio,
          maxDurationSec: spec.maxDurationSec,
          resolution: spec.resolution,
          brandVoice: args.brandVoice || null,
          callToAction: args.callToAction || null,
          rationale: args.rationale,
          // Agent should fill these with concrete creative direction after thinking:
          hook: null,              // first 3 seconds or headline
          visualDirection: null,   // mood, palette, composition
          sceneCount: args.formatType === 'video' ? 3 : 1,
          createdAt: new Date().toISOString(),
        }
        return {
          ok: true,
          draft,
          approvalRequired: true,
          note: 'כתוב את הטיוטה בפלט שלך. אחרי אישור המשתמש — המשך ל-draft_character_reference עם conceptId',
        }
      }
    },

    // ── GATE 2: CHARACTER REFERENCE ─────────────────────────────────────

    draft_character_reference: {
      description: 'Gate 2 — Draft 4 character/brand reference variations (prompts only, no generation yet). User picks the best one before scene creation.',
      parameters: {
        type: 'object',
        properties: {
          conceptId:       { type: 'string', description: 'From approved concept draft' },
          subjectType:     { type: 'string', enum: ['product', 'person', 'mascot', 'abstract'], description: 'Main subject of the creative' },
          subjectDescription:{ type: 'string', description: 'Detailed description of what to depict' },
          styleDirection:  { type: 'string', description: 'Visual style: photorealistic/illustration/3d/flat/cinematic etc' },
          colorPalette:    { type: 'array', items: { type: 'string' }, description: 'Hex colors or named palette (brand colors preferred)' },
          negativePrompt:  { type: 'string', description: 'What to avoid (e.g. "no text, no watermarks, no extra hands")' },
        },
        required: ['conceptId', 'subjectType', 'subjectDescription']
      },
      handler: async (args) => {
        // Produce 4 variation prompts — lighting, angle, mood variations
        const variations = [
          { id: 'v1', variant: 'hero-shot',     promptSuffix: 'studio lighting, front-facing, neutral background, professional product photography' },
          { id: 'v2', variant: 'lifestyle',     promptSuffix: 'natural lighting, contextual environment, lifestyle photography, candid' },
          { id: 'v3', variant: 'dramatic',      promptSuffix: 'dramatic lighting, high contrast, cinematic mood, editorial style' },
          { id: 'v4', variant: 'minimalist',    promptSuffix: 'clean minimalist composition, soft even lighting, lots of negative space' },
        ].map(v => ({
          ...v,
          fullPrompt: `${args.subjectDescription}. ${args.styleDirection || 'photorealistic'}. ${v.promptSuffix}`,
          colorPalette: args.colorPalette || [],
          negativePrompt: args.negativePrompt || 'no text, no watermarks, no logos, no extra limbs',
          // Model will be resolved at render time based on tier
          suggestedModel: null,
        }))

        const draft = {
          _type: 'creative_character_draft',
          characterRefId: 'char_' + Date.now().toString(36),
          conceptId: args.conceptId,
          subjectType: args.subjectType,
          subjectDescription: args.subjectDescription,
          styleDirection: args.styleDirection || 'photorealistic',
          variations,
          createdAt: new Date().toISOString(),
        }
        return {
          ok: true,
          draft,
          approvalRequired: true,
          note: 'המשתמש יבחר 1 מתוך 4 הוריאציות. אחרי אישור → draft_scene_variations עם characterRefId והוריאציה שנבחרה',
        }
      }
    },

    // ── GATE 3: SCENE VARIATIONS ────────────────────────────────────────

    draft_scene_variations: {
      description: 'Gate 3 — Draft scene variations for the selected character. For video: multiple scene beats. For image: multiple compositions.',
      parameters: {
        type: 'object',
        properties: {
          conceptId:       { type: 'string', description: 'From approved concept' },
          characterRefId:  { type: 'string', description: 'From approved character reference' },
          selectedVariation:{ type: 'string', description: 'Which character variation (v1-v4) user chose' },
          sceneCount:      { type: 'integer', description: 'How many scenes (1 for image, 3-6 for video storyboard)' },
          scenes: {
            type: 'array',
            description: 'Scene definitions — agent fills this in based on concept arc',
            items: {
              type: 'object',
              properties: {
                order:        { type: 'integer', description: 'Scene order (0-based)' },
                durationSec:  { type: 'number', description: 'Scene duration (video only)' },
                action:       { type: 'string', description: 'What happens in this scene' },
                camera:       { type: 'string', description: 'Camera move: static/pan/zoom/tracking/dolly' },
                prompt:       { type: 'string', description: 'Full generation prompt including character ref' },
                voiceoverHe:  { type: 'string', description: 'Hebrew voiceover text (optional)' },
                onScreenTextHe:{ type: 'string', description: 'Hebrew on-screen text overlay (optional)' },
              },
              required: ['order', 'action', 'prompt']
            }
          }
        },
        required: ['conceptId', 'characterRefId', 'selectedVariation', 'sceneCount', 'scenes']
      },
      handler: async (args) => {
        // Validate scene count matches array
        if (args.scenes.length !== args.sceneCount) {
          return {
            ok: false,
            error: `sceneCount=${args.sceneCount} לא תואם לאורך scenes=${args.scenes.length}`,
          }
        }

        const draft = {
          _type: 'creative_scenes_draft',
          scenesId: 'scenes_' + Date.now().toString(36),
          conceptId: args.conceptId,
          characterRefId: args.characterRefId,
          selectedVariation: args.selectedVariation,
          sceneCount: args.sceneCount,
          scenes: args.scenes.map(s => ({
            ...s,
            suggestedModel: null,  // resolved at render time
          })),
          createdAt: new Date().toISOString(),
        }
        return {
          ok: true,
          draft,
          approvalRequired: true,
          note: 'המשתמש יאשר scenes (או יבקש תיקון). אחרי אישור → draft_final_creative עם scenesId',
        }
      }
    },

    // ── GATE 4: FINAL CREATIVE (RENDER SPEC) ─────────────────────────────

    draft_final_creative: {
      description: 'Gate 4 — Final render spec. Resolves tier → model selection, Hebrew overlay config, storage path. Approval triggers live generation via fal.ai.',
      parameters: {
        type: 'object',
        properties: {
          scenesId:        { type: 'string', description: 'From approved scenes' },
          conceptId:       { type: 'string' },
          tier:            { type: 'string', enum: ['draft', 'standard', 'premium'] },
          formatType:      { type: 'string', enum: ['image', 'video', 'carousel', 'audio'] },
          hebrewOverlay:   { type: 'boolean', description: 'Apply Hebrew text/subtitle overlay (tenant VPS Sharp/ffmpeg)' },
          overlayConfig: {
            type: 'object',
            description: 'Hebrew overlay spec (only if hebrewOverlay=true)',
            properties: {
              font:          { type: 'string', description: 'Font name — default "Rubik" or "Heebo"' },
              fontSize:      { type: 'integer', description: 'pt (video) or px (image)' },
              color:         { type: 'string', description: 'Hex color' },
              position:      { type: 'string', enum: ['top', 'center', 'bottom', 'bottom_left', 'bottom_right'] },
              background:    { type: 'string', description: 'Optional semi-transparent bg (e.g. "rgba(0,0,0,0.5)")' },
              padding:       { type: 'integer', description: 'Padding px' },
            }
          },
          audio: {
            type: 'object',
            description: 'Audio track (optional for video)',
            properties: {
              voiceoverProvider: { type: 'string', enum: ['elevenlabs', 'none'] },
              voiceId:           { type: 'string', description: 'ElevenLabs voice ID (Hebrew-capable voices)' },
              musicProvider:     { type: 'string', enum: ['suno', 'none'] },
              musicPrompt:       { type: 'string', description: 'Music style description' },
            }
          },
          upscale:         { type: 'boolean', description: 'Apply Real-ESRGAN upscale (premium tier recommended)' },
          addSubtitles:    { type: 'boolean', description: 'Auto-generate Hebrew subtitles from voiceover' },
        },
        required: ['scenesId', 'conceptId', 'tier', 'formatType']
      },
      handler: async (args, ctx) => {
        // Tier → model selection (per Yotzer research doc)
        const TIER_MODELS = {
          draft: {
            image: 'fal-ai/nano-banana-pro',
            video: null,  // no video in draft tier
            audio: null,
            upscale: false,
            costEstimateUsd: { image: 0.04, video: 0, audio: 0 },
          },
          standard: {
            image: 'fal-ai/flux-pro/v1.1-ultra',
            video: 'fal-ai/kling-video/v2.5-turbo/pro/text-to-video',
            audio: 'elevenlabs/flash-v2.5',
            upscale: false,
            costEstimateUsd: { image: 0.12, video: 2.80, audio: 0.30 },
          },
          premium: {
            image: 'fal-ai/flux-pro/v1.1-ultra',
            video: 'fal-ai/veo-3.1',
            audio: 'elevenlabs/flash-v2.5',
            upscale: true,
            costEstimateUsd: { image: 0.12, video: 6.00, audio: 0.30 },
          },
        }
        const tierConfig = TIER_MODELS[args.tier]
        const model = args.formatType === 'video' ? tierConfig.video
                    : args.formatType === 'audio' ? tierConfig.audio
                    : tierConfig.image

        if (!model) {
          return {
            ok: false,
            error: `tier=${args.tier} לא תומך ב-formatType=${args.formatType}. שדרג ל-${args.tier === 'draft' ? 'standard' : 'premium'}`,
          }
        }

        const storageBase = (ctx?.config?.tenantStoragePath || '/opt/openclaw/creatives').replace(/\/$/, '')
        const creativeId = 'creative_' + Date.now().toString(36)

        const draft = {
          _type: 'creative_final_draft',
          creativeId,
          scenesId: args.scenesId,
          conceptId: args.conceptId,
          tier: args.tier,
          formatType: args.formatType,
          selectedModel: model,
          estimatedCostUsd: tierConfig.costEstimateUsd[args.formatType] || 0,
          hebrewOverlay: !!args.hebrewOverlay,
          overlayConfig: args.hebrewOverlay ? {
            font: args.overlayConfig?.font || 'Rubik',
            fontSize: args.overlayConfig?.fontSize || 48,
            color: args.overlayConfig?.color || '#FFFFFF',
            position: args.overlayConfig?.position || 'bottom',
            background: args.overlayConfig?.background || 'rgba(0,0,0,0.5)',
            padding: args.overlayConfig?.padding || 24,
          } : null,
          audio: args.audio && args.audio.voiceoverProvider !== 'none' ? args.audio : null,
          upscale: !!args.upscale && tierConfig.upscale,
          addSubtitles: !!args.addSubtitles,
          outputPath: `${storageBase}/${creativeId}/`,
          // After approval, executor will:
          //   1. Call fal.ai with selectedModel + scene prompts
          //   2. Download assets to outputPath on tenant VPS
          //   3. If hebrewOverlay: Sharp (image) or ffmpeg+libass (video) on tenant VPS
          //   4. If audio: ElevenLabs voiceover + optional Suno music → ffmpeg merge
          //   5. If upscale: Real-ESRGAN via fal.ai
          //   6. Final asset URL returned to user
          status: 'pending_approval',
          createdAt: new Date().toISOString(),
        }

        // Verify API key present for the selected model's provider
        const needsFal = model.startsWith('fal-ai/')
        const needsEl  = !!args.audio && args.audio.voiceoverProvider === 'elevenlabs'
        const warnings = []
        if (needsFal && !ctx?.config?.falApiKey)        warnings.push('חסר fal.ai API key — הוסף בהגדרות → Creative')
        if (needsEl  && !ctx?.config?.elevenLabsApiKey) warnings.push('חסר ElevenLabs API key — הוסף בהגדרות → Creative')

        return {
          ok: true,
          draft,
          approvalRequired: true,
          warnings: warnings.length > 0 ? warnings : undefined,
          note: 'לאחר אישור המשתמש — Executor ירנדר דרך fal.ai, יוריד לתיקיית הלקוח, ויוסיף overlay/audio/upscale לפי הצורך',
        }
      }
    },

    // ── READ TOOLS (for yotzer to check its own work) ───────────────────

    list_creatives: {
      description: 'List previously generated creatives for this instance. Read-only.',
      parameters: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['pending_approval', 'approved', 'rendered', 'all'], description: 'Filter by status' },
          limit:  { type: 'integer', description: 'Max results (default 20)' },
        }
      },
      handler: async (_args, _ctx) => {
        // Stub — real implementation will query tenant storage + agent_outputs table via heartbeat
        return {
          ok: false,
          error: 'list_creatives ייושם ב-Phase B — בינתיים השתמש ב-entity_timeline({entityId: "yotzer"}) דרך facts',
        }
      }
    },
  },
}
