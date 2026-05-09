CREATE TABLE IF NOT EXISTS users (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  username VARCHAR(64) NOT NULL UNIQUE,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

ALTER TABLE users ADD COLUMN email_verified BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS roles (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  code VARCHAR(32) NOT NULL UNIQUE,
  name VARCHAR(64) NOT NULL
);

CREATE TABLE IF NOT EXISTS user_roles (
  user_id BIGINT NOT NULL,
  role_id BIGINT NOT NULL,
  PRIMARY KEY (user_id, role_id)
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  token_hash VARCHAR(255) NOT NULL UNIQUE,
  expires_at DATETIME NOT NULL,
  revoked_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS domains (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  domain VARCHAR(255) NOT NULL UNIQUE,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  owner_user_id BIGINT NULL,
  visibility VARCHAR(32) NOT NULL DEFAULT 'private',
  publication_status VARCHAR(32) NOT NULL DEFAULT 'draft',
  verification_score INT NOT NULL DEFAULT 0,
  health_status VARCHAR(32) NOT NULL DEFAULT 'unknown',
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  weight INT NOT NULL DEFAULT 100,
  daily_limit INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

ALTER TABLE domains ADD COLUMN visibility VARCHAR(32) NOT NULL DEFAULT 'private';
ALTER TABLE domains ADD COLUMN publication_status VARCHAR(32) NOT NULL DEFAULT 'draft';
ALTER TABLE domains ADD COLUMN verification_score INT NOT NULL DEFAULT 0;
ALTER TABLE domains ADD COLUMN health_status VARCHAR(32) NOT NULL DEFAULT 'unknown';
ALTER TABLE domains ADD COLUMN owner_user_id BIGINT NULL;

CREATE TABLE IF NOT EXISTS mailboxes (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  domain_id BIGINT NOT NULL,
  local_part VARCHAR(128) NOT NULL,
  address VARCHAR(320) NOT NULL UNIQUE,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  expires_at DATETIME NOT NULL,
  is_favorite BOOLEAN NOT NULL DEFAULT FALSE,
  source VARCHAR(32) NOT NULL DEFAULT 'manual',
  last_message_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS messages (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  mailbox_id BIGINT NOT NULL,
  legacy_mailbox_key VARCHAR(255) NOT NULL,
  legacy_message_key VARCHAR(255) NOT NULL,
  source_kind VARCHAR(32) NOT NULL DEFAULT 'legacy-sync',
  source_message_id VARCHAR(255) NOT NULL DEFAULT '',
  mailbox_address VARCHAR(320) NOT NULL DEFAULT '',
  from_addr VARCHAR(320) NOT NULL,
  to_addr VARCHAR(320) NOT NULL,
  subject VARCHAR(512) NOT NULL,
  text_preview TEXT NULL,
  html_preview MEDIUMTEXT NULL,
  text_body MEDIUMTEXT NULL,
  html_body MEDIUMTEXT NULL,
  headers_json JSON NULL,
  raw_storage_key VARCHAR(1024) NULL,
  has_attachments BOOLEAN NOT NULL DEFAULT FALSE,
  size_bytes BIGINT NOT NULL DEFAULT 0,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  received_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_legacy_message (legacy_mailbox_key, legacy_message_key)
);

ALTER TABLE messages ADD COLUMN legacy_mailbox_key VARCHAR(255) NULL;
ALTER TABLE messages ADD COLUMN legacy_message_key VARCHAR(255) NULL;
ALTER TABLE messages ADD COLUMN source_kind VARCHAR(32) NOT NULL DEFAULT 'legacy-sync';
ALTER TABLE messages ADD COLUMN source_message_id VARCHAR(255) NOT NULL DEFAULT '';
ALTER TABLE messages ADD COLUMN mailbox_address VARCHAR(320) NOT NULL DEFAULT '';
ALTER TABLE messages ADD COLUMN text_body MEDIUMTEXT NULL;
ALTER TABLE messages ADD COLUMN html_body MEDIUMTEXT NULL;
ALTER TABLE messages ADD COLUMN headers_json JSON NULL;
ALTER TABLE messages ADD COLUMN raw_storage_key VARCHAR(1024) NULL;
ALTER TABLE messages ADD COLUMN has_attachments BOOLEAN NOT NULL DEFAULT FALSE;
UPDATE messages SET source_kind = 'legacy-sync' WHERE source_kind = 'inbucket';
CREATE UNIQUE INDEX uk_legacy_message ON messages (legacy_mailbox_key, legacy_message_key);

CREATE TABLE IF NOT EXISTS message_attachments (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  message_id BIGINT NOT NULL,
  filename VARCHAR(255) NOT NULL,
  content_type VARCHAR(255) NOT NULL,
  size_bytes BIGINT NOT NULL,
  storage_key VARCHAR(255) NOT NULL
);

CREATE TABLE IF NOT EXISTS mailbox_rules (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  mailbox_id BIGINT NOT NULL,
  retention_hours INT NOT NULL DEFAULT 24,
  auto_extend BOOLEAN NOT NULL DEFAULT FALSE,
  sender_mode VARCHAR(32) NOT NULL DEFAULT 'allow_all',
  sender_values JSON NULL,
  keyword_mode VARCHAR(32) NOT NULL DEFAULT 'allow_all',
  keyword_values JSON NULL
);

CREATE TABLE IF NOT EXISTS rules (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  retention_hours INT NOT NULL DEFAULT 24,
  auto_extend BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS mail_extractor_rules (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  owner_user_id BIGINT NULL,
  source_type VARCHAR(32) NOT NULL,
  template_key VARCHAR(128) NOT NULL DEFAULT '',
  name VARCHAR(255) NOT NULL,
  description TEXT NULL,
  label VARCHAR(128) NOT NULL DEFAULT '',
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  target_fields_json JSON NOT NULL,
  pattern TEXT NOT NULL,
  flags VARCHAR(16) NOT NULL DEFAULT '',
  result_mode VARCHAR(32) NOT NULL,
  capture_group_index INT NULL,
  mailbox_scope_json JSON NULL,
  domain_scope_json JSON NULL,
  sender_contains VARCHAR(255) NOT NULL DEFAULT '',
  subject_contains VARCHAR(255) NOT NULL DEFAULT '',
  sort_order INT NOT NULL DEFAULT 100,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE INDEX idx_mail_extractor_rules_owner_source ON mail_extractor_rules (owner_user_id, source_type, enabled);
CREATE INDEX idx_mail_extractor_rules_template_key ON mail_extractor_rules (template_key);

CREATE TABLE IF NOT EXISTS user_mail_extractor_templates (
  user_id BIGINT NOT NULL,
  rule_id BIGINT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, rule_id)
);

CREATE TABLE IF NOT EXISTS system_configs (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  config_key VARCHAR(128) NOT NULL UNIQUE,
  config_value JSON NOT NULL,
  updated_by BIGINT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS jobs (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  job_type VARCHAR(64) NOT NULL,
  status VARCHAR(32) NOT NULL,
  payload JSON NOT NULL,
  error_message TEXT NULL,
  scheduled_at DATETIME NOT NULL,
  finished_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  actor_user_id BIGINT NOT NULL,
  action VARCHAR(128) NOT NULL,
  resource_type VARCHAR(64) NOT NULL,
  resource_id VARCHAR(64) NOT NULL,
  detail JSON NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS auth_email_verifications (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  email VARCHAR(255) NOT NULL,
  purpose VARCHAR(64) NOT NULL,
  ticket_hash VARCHAR(255) NOT NULL UNIQUE,
  code_hash VARCHAR(255) NOT NULL,
  expires_at DATETIME NOT NULL,
  consumed_at DATETIME NULL,
  last_sent_at DATETIME NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE INDEX idx_auth_email_verifications_user_purpose ON auth_email_verifications (user_id, purpose, consumed_at);

CREATE TABLE IF NOT EXISTS notices (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  title VARCHAR(255) NOT NULL,
  body TEXT NOT NULL,
  category VARCHAR(64) NOT NULL DEFAULT 'platform',
  level VARCHAR(32) NOT NULL DEFAULT 'info',
  published_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

ALTER TABLE notices ADD COLUMN updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

CREATE TABLE IF NOT EXISTS doc_articles (
  id VARCHAR(128) PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  category VARCHAR(128) NOT NULL,
  summary TEXT NOT NULL,
  read_time_min INT NOT NULL DEFAULT 5,
  tags_json JSON NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS feedback_tickets (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  category VARCHAR(64) NOT NULL,
  subject VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'open',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS provider_accounts (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  provider VARCHAR(64) NOT NULL,
  owner_type VARCHAR(32) NOT NULL,
  owner_user_id BIGINT NULL,
  display_name VARCHAR(255) NOT NULL,
  auth_type VARCHAR(64) NOT NULL DEFAULT 'api_token',
  secret_ref VARCHAR(255) NOT NULL DEFAULT '',
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  capabilities_json JSON NULL,
  last_sync_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS dns_zones (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  provider_account_id BIGINT NULL,
  provider_zone_id VARCHAR(255) NOT NULL DEFAULT '',
  owner_user_id BIGINT NULL,
  zone_name VARCHAR(255) NOT NULL UNIQUE,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  visibility VARCHAR(32) NOT NULL DEFAULT 'private',
  publication_status VARCHAR(32) NOT NULL DEFAULT 'draft',
  verification_score INT NOT NULL DEFAULT 0,
  health_status VARCHAR(32) NOT NULL DEFAULT 'unknown',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

ALTER TABLE dns_zones MODIFY COLUMN provider_account_id BIGINT NULL;

CREATE TABLE IF NOT EXISTS domain_nodes (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  zone_id BIGINT NOT NULL,
  parent_node_id BIGINT NULL,
  fqdn VARCHAR(255) NOT NULL UNIQUE,
  kind VARCHAR(32) NOT NULL DEFAULT 'root',
  level INT NOT NULL DEFAULT 0,
  allocation_mode VARCHAR(32) NOT NULL DEFAULT 'manual',
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  weight INT NOT NULL DEFAULT 100,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS domain_verifications (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  zone_id BIGINT NOT NULL,
  node_id BIGINT NULL,
  verification_type VARCHAR(64) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  expected_records_json JSON NULL,
  observed_records_json JSON NULL,
  guidance_json JSON NULL,
  last_checked_at DATETIME NULL,
  last_error TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS dns_change_sets (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  zone_id BIGINT NULL,
  provider_account_id BIGINT NOT NULL,
  provider_zone_id VARCHAR(255) NOT NULL DEFAULT '',
  zone_name VARCHAR(255) NOT NULL DEFAULT '',
  requested_by_user_id BIGINT NOT NULL,
  requested_by_api_key_id BIGINT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'previewed',
  provider VARCHAR(64) NOT NULL,
  summary TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  applied_at DATETIME NULL
);

CREATE TABLE IF NOT EXISTS dns_change_operations (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  change_set_id BIGINT NOT NULL,
  operation VARCHAR(32) NOT NULL,
  record_type VARCHAR(32) NOT NULL,
  record_name VARCHAR(255) NOT NULL,
  before_json JSON NULL,
  after_json JSON NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'pending'
);

CREATE TABLE IF NOT EXISTS user_api_keys (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  name VARCHAR(128) NOT NULL,
  key_prefix VARCHAR(32) NOT NULL,
  key_preview VARCHAR(64) NOT NULL,
  secret_hash VARCHAR(255) NOT NULL DEFAULT '',
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  last_used_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at DATETIME NULL,
  rotated_at DATETIME NULL
);

ALTER TABLE user_api_keys ADD COLUMN secret_hash VARCHAR(255) NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS api_key_scopes (
  api_key_id BIGINT NOT NULL,
  scope VARCHAR(128) NOT NULL,
  PRIMARY KEY (api_key_id, scope)
);

CREATE TABLE IF NOT EXISTS api_key_resource_policies (
  api_key_id BIGINT PRIMARY KEY,
  domain_access_mode VARCHAR(32) NOT NULL DEFAULT 'mixed',
  allow_platform_public_domains BOOLEAN NOT NULL DEFAULT FALSE,
  allow_user_published_domains BOOLEAN NOT NULL DEFAULT FALSE,
  allow_owned_private_domains BOOLEAN NOT NULL DEFAULT TRUE,
  allow_provider_mutation BOOLEAN NOT NULL DEFAULT FALSE,
  allow_protected_record_write BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS api_key_domain_bindings (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  api_key_id BIGINT NOT NULL,
  zone_id BIGINT NULL,
  node_id BIGINT NULL,
  access_level VARCHAR(32) NOT NULL DEFAULT 'read',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_webhooks (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  name VARCHAR(128) NOT NULL,
  target_url VARCHAR(1024) NOT NULL,
  secret_preview VARCHAR(64) NOT NULL,
  events_json JSON NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  last_delivered_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_profiles (
  user_id BIGINT PRIMARY KEY,
  display_name VARCHAR(128) NOT NULL,
  locale VARCHAR(32) NOT NULL DEFAULT 'zh-CN',
  timezone VARCHAR(64) NOT NULL DEFAULT 'Asia/Shanghai',
  auto_refresh_seconds INT NOT NULL DEFAULT 30,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_totp_credentials (
  user_id BIGINT PRIMARY KEY,
  secret_ciphertext TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  verified_at DATETIME NULL,
  last_used_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS auth_mfa_challenges (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  ticket_hash VARCHAR(64) NOT NULL UNIQUE,
  purpose VARCHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  consumed_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_billing_profiles (
  user_id BIGINT PRIMARY KEY,
  plan_code VARCHAR(64) NOT NULL,
  plan_name VARCHAR(128) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  mailbox_quota INT NOT NULL DEFAULT 10,
  domain_quota INT NOT NULL DEFAULT 3,
  daily_request_limit INT NOT NULL DEFAULT 20000,
  renewal_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_balance_entries (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  entry_type VARCHAR(32) NOT NULL,
  amount BIGINT NOT NULL,
  description VARCHAR(255) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS inbound_message_spool (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  mail_from VARCHAR(255) NOT NULL,
  recipients_json JSON NOT NULL,
  target_mailbox_ids_json JSON NOT NULL,
  raw_message LONGBLOB NOT NULL,
  status VARCHAR(32) NOT NULL,
  error_message TEXT NULL,
  attempt_count INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 3,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  next_attempt_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processed_at DATETIME NULL
);

CREATE INDEX idx_mailboxes_user_status_expires ON mailboxes (user_id, status, expires_at);
CREATE INDEX idx_messages_mailbox_received ON messages (mailbox_id, received_at);
CREATE INDEX idx_feedback_user_created ON feedback_tickets (user_id, created_at);
CREATE INDEX idx_api_keys_user_status ON user_api_keys (user_id, status);
CREATE INDEX idx_webhooks_user_enabled ON user_webhooks (user_id, enabled);
CREATE INDEX idx_balance_user_created ON user_balance_entries (user_id, created_at);
CREATE INDEX idx_auth_mfa_challenges_user_id ON auth_mfa_challenges (user_id, expires_at);
CREATE INDEX idx_provider_accounts_owner ON provider_accounts (owner_type, owner_user_id, status);
CREATE INDEX idx_dns_change_sets_zone_status ON dns_change_sets (zone_id, status, created_at);
CREATE INDEX idx_dns_change_ops_change_set ON dns_change_operations (change_set_id, id);
CREATE INDEX idx_dns_zones_provider ON dns_zones (provider_account_id, status);
CREATE INDEX idx_dns_zones_owner_visibility ON dns_zones (owner_user_id, visibility, publication_status);
CREATE INDEX idx_domain_nodes_zone_parent ON domain_nodes (zone_id, parent_node_id, status);
CREATE UNIQUE INDEX uk_domain_verification_profile ON domain_verifications (zone_id, node_id, verification_type);
CREATE INDEX idx_api_key_domain_bindings_api_key ON api_key_domain_bindings (api_key_id, access_level);
CREATE INDEX idx_inbound_message_spool_status_id ON inbound_message_spool (status, id);

CREATE FULLTEXT INDEX ft_messages_search ON messages (from_addr, subject, text_preview);

ALTER TABLE mailboxes ADD COLUMN retention_days INT NOT NULL DEFAULT 0;
