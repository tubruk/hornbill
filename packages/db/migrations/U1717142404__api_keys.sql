-- Create api_keys table
CREATE TABLE IF NOT EXISTS api_keys (
    id BLOB PRIMARY KEY DEFAULT (uuid_v4()) CHECK (is_uuid_v4(id)) NOT NULL,
    user_id BLOB NOT NULL REFERENCES _user(id) ON DELETE CASCADE CHECK (is_uuid(user_id)),
    name TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    created_at INTEGER NOT NULL DEFAULT (UNIXEPOCH()),
    last_used_at INTEGER
) STRICT;

CREATE INDEX IF NOT EXISTS idx_api_keys_token_hash ON api_keys(token_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id);
