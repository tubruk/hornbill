-- Add payday_config column to accounts table
ALTER TABLE accounts ADD COLUMN payday_config TEXT;

-- Create account_holidays table for storing merged holiday dates
CREATE TABLE IF NOT EXISTS account_holidays (
    id BLOB PRIMARY KEY DEFAULT (uuid_v4()) CHECK (is_uuid_v4(id)) NOT NULL,
    account_id BLOB NOT NULL REFERENCES accounts(id) ON DELETE CASCADE CHECK (is_uuid_v4(account_id)),
    date TEXT NOT NULL,       -- YYYY-MM-DD
    name TEXT NOT NULL,       -- e.g. "New Year's Day"
    source TEXT NOT NULL,     -- 'ics_file' | 'ics_url' | 'manual'
    created_at INTEGER NOT NULL DEFAULT (UNIXEPOCH()),
    updated_at INTEGER NOT NULL DEFAULT (UNIXEPOCH()),
    UNIQUE(account_id, date)
) STRICT;

CREATE INDEX IF NOT EXISTS idx_account_holidays_account_id ON account_holidays(account_id);
