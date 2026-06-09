-- Create accounts table
CREATE TABLE IF NOT EXISTS accounts (
    id BLOB PRIMARY KEY DEFAULT (uuid_v4()) CHECK (is_uuid_v4(id)) NOT NULL,
    name TEXT NOT NULL,
    upcoming_threshold_days INTEGER NOT NULL DEFAULT 7,
    created_at INTEGER NOT NULL DEFAULT (UNIXEPOCH()),
    updated_at INTEGER NOT NULL DEFAULT (UNIXEPOCH())
) STRICT;

-- Create bills table
CREATE TABLE IF NOT EXISTS bills (
    id BLOB PRIMARY KEY DEFAULT (uuid_v4()) CHECK (is_uuid_v4(id)) NOT NULL,
    account_id BLOB NOT NULL REFERENCES accounts(id) ON DELETE CASCADE CHECK (is_uuid_v4(account_id)),
    name TEXT NOT NULL,
    currency TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    recurrence TEXT NOT NULL,  -- JSON string containing Recurrence config
    start_date TEXT NOT NULL,  -- YYYY-MM-DD
    active INTEGER NOT NULL DEFAULT 1, -- Boolean (0 = false, 1 = true)
    upcoming_threshold_days INTEGER, -- Nullable (null = fallback to account default)
    notes TEXT,
    created_at INTEGER NOT NULL DEFAULT (UNIXEPOCH()),
    updated_at INTEGER NOT NULL DEFAULT (UNIXEPOCH())
) STRICT;

CREATE INDEX IF NOT EXISTS idx_bills_account_id ON bills(account_id);

-- Create payments table
CREATE TABLE IF NOT EXISTS payments (
    id BLOB PRIMARY KEY DEFAULT (uuid_v4()) CHECK (is_uuid_v4(id)) NOT NULL,
    bill_id BLOB NOT NULL REFERENCES bills(id) ON DELETE CASCADE CHECK (is_uuid_v4(bill_id)),
    due_date TEXT NOT NULL,    -- YYYY-MM-DD
    amount_cents INTEGER NOT NULL,
    paid_at INTEGER,           -- Unix epoch timestamp in seconds (Nullable)
    notes TEXT,
    created_at INTEGER NOT NULL DEFAULT (UNIXEPOCH()),
    updated_at INTEGER NOT NULL DEFAULT (UNIXEPOCH())
) STRICT;

CREATE INDEX IF NOT EXISTS idx_payments_bill_id ON payments(bill_id);
CREATE INDEX IF NOT EXISTS idx_payments_due_date ON payments(due_date);
