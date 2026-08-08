-- Add description column to businesses to store the business description
-- entered during registration

ALTER TABLE IF EXISTS businesses
  ADD COLUMN IF NOT EXISTS description TEXT;