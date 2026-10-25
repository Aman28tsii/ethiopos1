-- Add bottle_size_ml for bottle-tracked bar ingredients.
-- Safe to run multiple times.
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS bottle_size_ml INTEGER;
