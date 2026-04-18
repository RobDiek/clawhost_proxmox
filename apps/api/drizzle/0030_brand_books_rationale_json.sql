-- Structured rationale + confidence reasons (Tier 2-O + 2-T).
-- Old rationale_he text column kept for backcompat — new rationale_json jsonb
-- holds {overall, colors, typography, voice, identity} sections.

ALTER TABLE brand_books
    ADD COLUMN IF NOT EXISTS rationale_json      jsonb,  -- { overall, colors, typography, voice, identity }
    ADD COLUMN IF NOT EXISTS confidence_reasons  jsonb;  -- string[]
