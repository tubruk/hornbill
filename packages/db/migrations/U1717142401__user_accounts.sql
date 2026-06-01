-- Create account_users join table with single-column primary key as required by Trailbase
CREATE TABLE IF NOT EXISTS account_users (
    id BLOB PRIMARY KEY DEFAULT (uuid_v4()) CHECK (is_uuid_v4(id)) NOT NULL,
    account_id BLOB NOT NULL REFERENCES accounts(id) ON DELETE CASCADE CHECK (is_uuid_v4(account_id)),
    user_id BLOB NOT NULL REFERENCES _user(id) ON DELETE CASCADE CHECK (is_uuid(user_id)),
    UNIQUE(account_id, user_id)
) STRICT;

CREATE INDEX IF NOT EXISTS idx_account_users_user_id ON account_users(user_id);
