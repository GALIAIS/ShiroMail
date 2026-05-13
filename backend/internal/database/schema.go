package database

import (
	"context"
	"embed"
	"errors"
	"fmt"
	"regexp"
	"strings"

	mysqlDriver "github.com/go-sql-driver/mysql"
	"gorm.io/gorm"
)

//go:embed migrations/*.sql
var migrationFiles embed.FS

var createIndexPattern = regexp.MustCompile("(?is)^CREATE\\s+(?:(?:UNIQUE|FULLTEXT|SPATIAL)\\s+)?INDEX\\s+`?([a-zA-Z0-9_]+)`?\\s+ON\\s+`?([a-zA-Z0-9_]+)`?\\s*\\(")
var alterAddColumnPattern = regexp.MustCompile("(?is)^ALTER\\s+TABLE\\s+`?([a-zA-Z0-9_]+)`?\\s+ADD\\s+COLUMN\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?`?([a-zA-Z0-9_]+)`?\\s+")

func EnsureSchema(ctx context.Context, db *gorm.DB) error {
	entries, err := migrationFiles.ReadDir("migrations")
	if err != nil {
		return fmt.Errorf("read migrations directory: %w", err)
	}

	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		body, err := migrationFiles.ReadFile("migrations/" + entry.Name())
		if err != nil {
			return fmt.Errorf("read migration %s: %w", entry.Name(), err)
		}
		for _, stmt := range splitSQLStatements(string(body)) {
			if err := applySchemaStatement(ctx, db, stmt); err != nil {
				return err
			}
		}
	}

	if err := migrateLegacyMessageCompatibility(ctx, db); err != nil {
		return err
	}
	if err := ensureMessageTableUTF8MB4(ctx, db); err != nil {
		return err
	}

	return nil
}

func splitSQLStatements(body string) []string {
	parts := strings.Split(body, ";")
	statements := make([]string, 0, len(parts))
	for _, part := range parts {
		stmt := strings.TrimSpace(part)
		if stmt == "" {
			continue
		}
		statements = append(statements, stmt)
	}
	return statements
}

func applySchemaStatement(ctx context.Context, db *gorm.DB, statement string) error {
	if indexName, tableName, ok := parseCreateIndex(statement); ok {
		return ensureIndex(ctx, db, tableName, indexName, statement)
	}
	if tableName, columnName, ok := parseAlterAddColumn(statement); ok {
		return ensureColumn(ctx, db, tableName, columnName, statement)
	}

	if err := db.WithContext(ctx).Exec(statement).Error; err != nil {
		return fmt.Errorf("apply schema statement: %w", err)
	}
	return nil
}

func parseCreateIndex(statement string) (string, string, bool) {
	matches := createIndexPattern.FindStringSubmatch(strings.TrimSpace(statement))
	if len(matches) != 3 {
		return "", "", false
	}
	return matches[1], matches[2], true
}

func parseAlterAddColumn(statement string) (string, string, bool) {
	matches := alterAddColumnPattern.FindStringSubmatch(strings.TrimSpace(statement))
	if len(matches) != 3 {
		return "", "", false
	}
	return matches[1], matches[2], true
}

func ensureIndex(ctx context.Context, db *gorm.DB, tableName string, indexName string, statement string) error {
	var count int64
	if err := db.WithContext(ctx).Raw(
		"SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?",
		tableName,
		indexName,
	).Scan(&count).Error; err != nil {
		return fmt.Errorf("lookup index %s on %s: %w", indexName, tableName, err)
	}
	if count > 0 {
		return nil
	}

	if err := db.WithContext(ctx).Exec(statement).Error; err != nil {
		if isDuplicateIndexError(err, indexName) {
			return nil
		}
		return fmt.Errorf("create index %s on %s: %w", indexName, tableName, err)
	}
	return nil
}

func ensureColumn(ctx context.Context, db *gorm.DB, tableName string, columnName string, statement string) error {
	var count int64
	if err := db.WithContext(ctx).Raw(
		"SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?",
		tableName,
		columnName,
	).Scan(&count).Error; err != nil {
		return fmt.Errorf("lookup column %s on %s: %w", columnName, tableName, err)
	}
	if count > 0 {
		return nil
	}

	if err := db.WithContext(ctx).Exec(statement).Error; err != nil {
		if isDuplicateColumnError(err, columnName) {
			return nil
		}
		return fmt.Errorf("create column %s on %s: %w", columnName, tableName, err)
	}
	return nil
}

func isDuplicateIndexError(err error, indexName string) bool {
	var mysqlErr *mysqlDriver.MySQLError
	if errors.As(err, &mysqlErr) && mysqlErr.Number == 1061 {
		return true
	}
	return strings.Contains(strings.ToLower(err.Error()), "duplicate key name '"+strings.ToLower(indexName)+"'")
}

func isDuplicateColumnError(err error, columnName string) bool {
	var mysqlErr *mysqlDriver.MySQLError
	if errors.As(err, &mysqlErr) && mysqlErr.Number == 1060 {
		return true
	}
	return strings.Contains(strings.ToLower(err.Error()), "duplicate column name '"+strings.ToLower(columnName)+"'")
}

func columnExists(ctx context.Context, db *gorm.DB, tableName string, columnName string) (bool, error) {
	var count int64
	if err := db.WithContext(ctx).Raw(
		"SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?",
		tableName,
		columnName,
	).Scan(&count).Error; err != nil {
		return false, fmt.Errorf("lookup column %s on %s: %w", columnName, tableName, err)
	}
	return count > 0, nil
}

func indexExists(ctx context.Context, db *gorm.DB, tableName string, indexName string) (bool, error) {
	var count int64
	if err := db.WithContext(ctx).Raw(
		"SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?",
		tableName,
		indexName,
	).Scan(&count).Error; err != nil {
		return false, fmt.Errorf("lookup index %s on %s: %w", indexName, tableName, err)
	}
	return count > 0, nil
}

func tableExists(ctx context.Context, db *gorm.DB, tableName string) (bool, error) {
	var count int64
	if err := db.WithContext(ctx).Raw(
		"SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?",
		tableName,
	).Scan(&count).Error; err != nil {
		return false, fmt.Errorf("lookup table %s: %w", tableName, err)
	}
	return count > 0, nil
}

func ensureTableCollation(ctx context.Context, db *gorm.DB, tableName string, collation string) error {
	var current string
	if err := db.WithContext(ctx).Raw(
		"SELECT table_collation FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1",
		tableName,
	).Scan(&current).Error; err != nil {
		return fmt.Errorf("lookup collation for %s: %w", tableName, err)
	}
	if strings.EqualFold(current, collation) {
		return nil
	}

	charset := collation
	if index := strings.Index(collation, "_"); index > 0 {
		charset = collation[:index]
	}

	if err := db.WithContext(ctx).Exec(
		fmt.Sprintf("ALTER TABLE `%s` CONVERT TO CHARACTER SET %s COLLATE %s", tableName, charset, collation),
	).Error; err != nil {
		return fmt.Errorf("convert table %s to %s: %w", tableName, collation, err)
	}
	return nil
}

func ensureMessageTableUTF8MB4(ctx context.Context, db *gorm.DB) error {
	exists, err := tableExists(ctx, db, "messages")
	if err != nil {
		return err
	}
	if !exists {
		return nil
	}
	return ensureTableCollation(ctx, db, "messages", "utf8mb4_unicode_ci")
}

func migrateLegacyMessageCompatibility(ctx context.Context, db *gorm.DB) error {
	hasLegacyMailbox, err := columnExists(ctx, db, "messages", "legacy_mailbox_key")
	if err != nil {
		return err
	}
	hasLegacyMessage, err := columnExists(ctx, db, "messages", "legacy_message_key")
	if err != nil {
		return err
	}
	if !hasLegacyMailbox || !hasLegacyMessage {
		return nil
	}

	hasCompatMailbox, err := columnExists(ctx, db, "messages", "inbucket_mailbox")
	if err != nil {
		return err
	}
	hasCompatMessage, err := columnExists(ctx, db, "messages", "inbucket_message_id")
	if err != nil {
		return err
	}

	mailboxExpr := "COALESCE(NULLIF(legacy_mailbox_key, ''), NULLIF(mailbox_address, ''), to_addr)"
	if hasCompatMailbox {
		mailboxExpr = "COALESCE(NULLIF(legacy_mailbox_key, ''), NULLIF(inbucket_mailbox, ''), NULLIF(mailbox_address, ''), to_addr)"
	}
	if err := db.WithContext(ctx).Exec(
		fmt.Sprintf("UPDATE messages SET legacy_mailbox_key = %s WHERE legacy_mailbox_key IS NULL OR legacy_mailbox_key = ''", mailboxExpr),
	).Error; err != nil {
		return fmt.Errorf("backfill legacy mailbox key: %w", err)
	}

	messageExpr := "COALESCE(NULLIF(legacy_message_key, ''), NULLIF(source_message_id, ''), CONCAT('legacy-', id))"
	if hasCompatMessage {
		messageExpr = "COALESCE(NULLIF(legacy_message_key, ''), NULLIF(inbucket_message_id, ''), NULLIF(source_message_id, ''), CONCAT('legacy-', id))"
	}
	if err := db.WithContext(ctx).Exec(
		fmt.Sprintf("UPDATE messages SET legacy_message_key = %s WHERE legacy_message_key IS NULL OR legacy_message_key = ''", messageExpr),
	).Error; err != nil {
		return fmt.Errorf("backfill legacy message key: %w", err)
	}

	if err := db.WithContext(ctx).Exec(
		"UPDATE messages SET source_kind = 'legacy-sync' WHERE source_kind = 'inbucket'",
	).Error; err != nil {
		return fmt.Errorf("normalize legacy source kind: %w", err)
	}

	if err := db.WithContext(ctx).Exec(
		"ALTER TABLE messages MODIFY COLUMN legacy_mailbox_key VARCHAR(255) NOT NULL",
	).Error; err != nil {
		return fmt.Errorf("enforce legacy_mailbox_key not null: %w", err)
	}
	if err := db.WithContext(ctx).Exec(
		"ALTER TABLE messages MODIFY COLUMN legacy_message_key VARCHAR(255) NOT NULL",
	).Error; err != nil {
		return fmt.Errorf("enforce legacy_message_key not null: %w", err)
	}
	if err := db.WithContext(ctx).Exec(
		"ALTER TABLE messages MODIFY COLUMN source_kind VARCHAR(32) NOT NULL DEFAULT 'legacy-sync'",
	).Error; err != nil {
		return fmt.Errorf("enforce legacy source kind default: %w", err)
	}

	hasCompatIndex, err := indexExists(ctx, db, "messages", "uk_inbucket_message")
	if err != nil {
		return err
	}
	if hasCompatIndex {
		if err := db.WithContext(ctx).Exec("DROP INDEX uk_inbucket_message ON messages").Error; err != nil {
			return fmt.Errorf("drop compat index uk_inbucket_message: %w", err)
		}
	}

	if hasCompatMailbox {
		if err := db.WithContext(ctx).Exec("ALTER TABLE messages DROP COLUMN inbucket_mailbox").Error; err != nil {
			return fmt.Errorf("drop compat column inbucket_mailbox: %w", err)
		}
	}
	if hasCompatMessage {
		if err := db.WithContext(ctx).Exec("ALTER TABLE messages DROP COLUMN inbucket_message_id").Error; err != nil {
			return fmt.Errorf("drop compat column inbucket_message_id: %w", err)
		}
	}

	return nil
}
