-- Persist composer rationale + confidence on brand_books so they survive the
-- compose -> review -> approve roundtrip (previously lost after response).
-- Also add hebrew_corrections to track what grammar-validator fixed
-- (valuable learning signal for prompt iteration).

ALTER TABLE brand_books
    ADD COLUMN IF NOT EXISTS rationale_he        text,
    ADD COLUMN IF NOT EXISTS confidence          text,  -- 'high' | 'medium' | 'low'
    ADD COLUMN IF NOT EXISTS hebrew_corrections  jsonb; -- [{ path, original, fixed, issue }]
