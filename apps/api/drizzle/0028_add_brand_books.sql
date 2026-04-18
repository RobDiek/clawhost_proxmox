-- Brand Books — visual+voice identity per instance, feeds Yotzer creative pipeline.
-- Supports versioning (one row per version), lookup via status='approved' + latest.
-- Fields cover: identity, logo, colors, typography, imagery, voice, components, compliance.
-- Rationale: keeping brand data in its own table (not jsonb on instances) for:
--   1. Versioning — one row per major update, history preserved
--   2. Queryability — menateach / yotzer / ayat do fact queries against structured fields
--   3. Multi-tenant-safe — FK cascade on instance delete

CREATE TABLE IF NOT EXISTS brand_books (
    id                 text PRIMARY KEY,
    instance_id        text NOT NULL REFERENCES instances(id) ON DELETE CASCADE,
    version            integer NOT NULL DEFAULT 1,
    status             text NOT NULL DEFAULT 'draft',
    -- draft | pending_approval | approved | archived | locked

    source             text NOT NULL DEFAULT 'extracted',
    -- extracted (scraped from URL) | generated (AI from scratch) | uploaded (user PDF) | mixed

    -- ── Identity ───────────────────────────────────────────────
    business_name      text,
    legal_name         text,
    tagline_he         text,
    tagline_en         text,
    mission_he         text,
    mission_en         text,
    manifesto_he       text,
    positioning_line   text,

    -- ── Logo ──────────────────────────────────────────────────
    -- jsonb so we can evolve without migrations:
    -- { primary: {url, tenantPath, format, dimensions, transparentBg},
    --   horizontal: {...}, monogram: {...}, favicon: {...},
    --   sourceFiles: [{type: 'svg'|'ai'|'psd', url}],
    --   usageRules: {minSizePx, safeZonePx, allowedBackgrounds[], forbiddenContexts[]},
    --   aiGenerated: bool, vectorizedFrom: url|null }
    logo               jsonb,

    -- ── Colors ─────────────────────────────────────────────────
    -- { primary: {hex, rgb, cmyk, name, usage, contrastWhite, contrastBlack},
    --   secondary: {...}, accent: [{...}], neutrals: [{...}],
    --   semantic: {success, warning, danger, info},
    --   gradients: [{from, to, angle, name}] }
    colors             jsonb,

    -- ── Typography ─────────────────────────────────────────────
    -- { heading: {family, weights[], sizeScale[], license, url},
    --   body: {...}, accent: {...},
    --   hebrewSupport: {headingFamily, bodyFamily},
    --   rules: {lineHeight, letterSpacing, maxLineLength} }
    typography         jsonb,

    -- ── Imagery ────────────────────────────────────────────────
    -- { photographyStyle: {primary, lightingPreference, compositionRules[]},
    --   illustrationStyle: {present, style, colorApproach},
    --   moodKeywords: [...], referenceUrls: [...], negativeReferences: [...],
    --   doNotUse: [...] }
    imagery            jsonb,

    -- ── Voice ──────────────────────────────────────────────────
    -- { tone, personalityAdjectives[], vocabularyDo[], vocabularyDont[],
    --   signaturePhrases[], hebrewRegister, humor,
    --   examples: {headline_winner, headline_loser, body_winner, body_loser} }
    voice              jsonb,

    -- ── Components ─────────────────────────────────────────────
    -- { iconSet, patterns[], shapes: {cornerRadius, borderStyle},
    --   photographyTreatments[] }
    components         jsonb,

    -- ── Compliance / legal ─────────────────────────────────────
    -- { aiGeneratedDisclosure, copyrightNotice,
    --   trademarkRegistered, trademarkCountries[] }
    compliance         jsonb,

    -- ── Principles / brand constitution ────────────────────────
    -- Airbnb-style: hard rules for all creative generation
    -- ["never use fear-based marketing", "always include Hebrew first", ...]
    principles         jsonb,

    -- ── Export ─────────────────────────────────────────────────
    pdf_url            text,
    pdf_generated_at   timestamptz,

    -- ── Gaps (flagged missing fields — drives UI prompts) ──────
    -- [{priority: 'critical'|'important'|'nice_to_have', field: 'logo.primary', suggestion: '...'}]
    gaps               jsonb,

    -- ── Scraping source (for extracted brand books) ────────────
    source_url         text,
    source_scraped_at  timestamptz,
    source_raw         jsonb,   -- raw data from scraper, for debugging

    -- ── Workflow ───────────────────────────────────────────────
    approved_at        timestamptz,
    approved_by        text,
    locked_until       timestamptz,

    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS brand_books_instance_idx ON brand_books(instance_id);
CREATE INDEX IF NOT EXISTS brand_books_status_idx  ON brand_books(instance_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS brand_books_instance_version_uniq ON brand_books(instance_id, version);

-- Constraint: only one approved brand book per instance at a time
-- (archived rows don't count — they have status='archived')
CREATE UNIQUE INDEX IF NOT EXISTS brand_books_one_approved_per_instance
    ON brand_books(instance_id)
    WHERE status = 'approved';
