-- Add calendar_token column to accounts table
ALTER TABLE accounts ADD COLUMN calendar_token TEXT;

-- Create unique filtered index for fast token resolution
CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_calendar_token
ON accounts(calendar_token)
WHERE calendar_token IS NOT NULL;
