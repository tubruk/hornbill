-- Add notification_provider and notification_reminder columns to accounts table
ALTER TABLE accounts ADD COLUMN notification_provider TEXT NOT NULL DEFAULT '{"type":"webhook","config":{}}';
ALTER TABLE accounts ADD COLUMN notification_reminder TEXT NOT NULL DEFAULT '{"enabled":false,"days_before_due":3,"time":"09:00","timezone":"UTC","last_reminded_date":null}';
