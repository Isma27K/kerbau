-- Add settings for opt-in request tabs and restoring them on startup
ALTER TABLE settings
    ADD COLUMN request_tabs_enabled BOOLEAN DEFAULT FALSE NOT NULL;
ALTER TABLE settings
    ADD COLUMN request_tabs_restore BOOLEAN DEFAULT FALSE NOT NULL;
