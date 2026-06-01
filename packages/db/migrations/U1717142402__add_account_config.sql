-- Add currencies, default_currency, and archived columns to accounts table
ALTER TABLE accounts ADD COLUMN currencies TEXT NOT NULL DEFAULT '["IDR","USD"]';
ALTER TABLE accounts ADD COLUMN default_currency TEXT NOT NULL DEFAULT 'IDR';
ALTER TABLE accounts ADD COLUMN archived INTEGER NOT NULL DEFAULT 0;
