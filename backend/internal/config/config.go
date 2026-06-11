package config

import (
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"
)

type Config struct {
	AppPort               string
	AppEnv                string
	CORSAllowedOrigins    []string
	MySQLDSN              string
	RedisAddr             string
	RedisPassword         string
	JWTSecret             string
	MetricsToken          string
	CloudflareAPIBaseURL  string
	SpaceshipAPIBaseURL   string
	LegacyMailSyncAPIURL  string
	LegacyMailSyncEnabled bool
	MailStoragePath       string
}

func MustLoadConfig() Config {
	return Config{
		AppPort:               envOrDefault("APP_PORT", "8080"),
		AppEnv:                envOrDefault("APP_ENV", "development"),
		CORSAllowedOrigins:    splitEnv("CORS_ALLOWED_ORIGINS", "http://127.0.0.1:5173,http://localhost:5173"),
		MySQLDSN:              envOrDefault("MYSQL_DSN", "root:root@tcp(mysql:3306)/shiro_email?parseTime=true"),
		RedisAddr:             envOrDefault("REDIS_ADDR", "redis:6379"),
		RedisPassword:         envOrDefault("REDIS_PASSWORD", ""),
		JWTSecret:             envOrDefault("JWT_SECRET", "dev-secret"),
		MetricsToken:          envOrDefault("METRICS_TOKEN", ""),
		CloudflareAPIBaseURL:  envOrDefault("CLOUDFLARE_API_BASE_URL", "https://api.cloudflare.com/client/v4"),
		SpaceshipAPIBaseURL:   envOrDefault("SPACESHIP_API_BASE_URL", "https://spaceship.dev/api"),
		LegacyMailSyncAPIURL:  envOrDefault("LEGACY_MAIL_SYNC_API_URL", ""),
		LegacyMailSyncEnabled: boolEnvOrDefault("LEGACY_MAIL_SYNC_ENABLED", false),
		MailStoragePath:       envOrDefault("MAIL_STORAGE_PATH", "./data/mail"),
	}
}

func envOrDefault(key string, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}

	return fallback
}

func boolEnvOrDefault(key string, fallback bool) bool {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}

	parsed, err := strconv.ParseBool(value)
	if err != nil {
		return fallback
	}
	return parsed
}

func intEnvOrDefault(key string, fallback int) int {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}

	parsed, err := strconv.Atoi(value)
	if err != nil {
		return fallback
	}
	return parsed
}

func splitEnv(key string, fallback string) []string {
	value := envOrDefault(key, fallback)
	parts := strings.Split(value, ",")
	result := make([]string, 0, len(parts))
	for _, p := range parts {
		if trimmed := strings.TrimSpace(p); trimmed != "" {
			result = append(result, trimmed)
		}
	}
	return result
}

func (c Config) IsProduction() bool {
	return c.AppEnv == "production"
}

func (c Config) Validate() error {
	var validationErrors []error

	if strings.TrimSpace(c.AppPort) == "" {
		validationErrors = append(validationErrors, errors.New("APP_PORT is required"))
	}
	if strings.TrimSpace(c.MySQLDSN) == "" {
		validationErrors = append(validationErrors, errors.New("MYSQL_DSN is required"))
	}
	if strings.TrimSpace(c.RedisAddr) == "" {
		validationErrors = append(validationErrors, errors.New("REDIS_ADDR is required"))
	}
	if strings.TrimSpace(c.MailStoragePath) == "" {
		validationErrors = append(validationErrors, errors.New("MAIL_STORAGE_PATH is required"))
	}

	if c.IsProduction() {
		if isWeakJWTSecret(c.JWTSecret) {
			validationErrors = append(validationErrors, fmt.Errorf("JWT_SECRET must be at least 32 characters and not a default value in production"))
		}
		if usesDefaultMySQLCredentials(c.MySQLDSN) {
			validationErrors = append(validationErrors, fmt.Errorf("MYSQL_DSN must not use default root/root credentials in production"))
		}
		if strings.TrimSpace(c.RedisPassword) == "" {
			validationErrors = append(validationErrors, fmt.Errorf("REDIS_PASSWORD is required in production"))
		}
		if strings.TrimSpace(c.MetricsToken) == "" {
			validationErrors = append(validationErrors, fmt.Errorf("METRICS_TOKEN is required in production"))
		}
		for _, origin := range c.CORSAllowedOrigins {
			if isLocalhostOrigin(origin) {
				validationErrors = append(validationErrors, fmt.Errorf("CORS_ALLOWED_ORIGINS must not include localhost or 127.0.0.1 in production"))
				break
			}
		}
	}

	return errors.Join(validationErrors...)
}

func isWeakJWTSecret(secret string) bool {
	trimmed := strings.TrimSpace(secret)
	weak := map[string]bool{
		"":                        true,
		"dev-secret":              true,
		"change-me-in-production": true,
		"secret":                  true,
	}
	return len(trimmed) < 32 || weak[trimmed]
}

func usesDefaultMySQLCredentials(dsn string) bool {
	normalized := strings.ToLower(strings.TrimSpace(dsn))
	return strings.HasPrefix(normalized, "root:root@")
}

func isLocalhostOrigin(origin string) bool {
	normalized := strings.ToLower(strings.TrimSpace(origin))
	return strings.Contains(normalized, "localhost") ||
		strings.Contains(normalized, "127.0.0.1") ||
		strings.Contains(normalized, "[::1]")
}
