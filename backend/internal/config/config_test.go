package config

import (
	"strings"
	"testing"
)

func TestLoadConfigFromEnv(t *testing.T) {
	t.Setenv("APP_PORT", "8080")
	t.Setenv("CLOUDFLARE_API_BASE_URL", "https://cf.test/client/v4")
	t.Setenv("SPACESHIP_API_BASE_URL", "https://spaceship.test/api")
	cfg := MustLoadConfig()
	if cfg.AppPort != "8080" {
		t.Fatalf("expected app port 8080, got %s", cfg.AppPort)
	}
	if cfg.CloudflareAPIBaseURL != "https://cf.test/client/v4" {
		t.Fatalf("expected cloudflare api base url override, got %s", cfg.CloudflareAPIBaseURL)
	}
	if cfg.SpaceshipAPIBaseURL != "https://spaceship.test/api" {
		t.Fatalf("expected spaceship api base url override, got %s", cfg.SpaceshipAPIBaseURL)
	}
	t.Setenv("LEGACY_MAIL_SYNC_ENABLED", "")
	if cfg.LegacyMailSyncEnabled {
		t.Fatal("expected legacy mail sync to be disabled by default")
	}
}

func TestValidateProductionRejectsWeakJWTSecret(t *testing.T) {
	cfg := Config{
		AppEnv:             "production",
		AppPort:            "8080",
		CORSAllowedOrigins: []string{"https://mail.example.com"},
		MySQLDSN:           "app:strong-password@tcp(mysql:3306)/shiro_email?parseTime=true",
		RedisAddr:          "redis:6379",
		RedisPassword:      "redis-password",
		JWTSecret:          "dev-secret",
		MetricsToken:       "metrics-token",
		MailStoragePath:    "/app/data/mail",
	}

	err := cfg.Validate()
	if err == nil {
		t.Fatal("expected weak JWT secret validation error")
	}
	if !strings.Contains(err.Error(), "JWT_SECRET") {
		t.Fatalf("expected JWT_SECRET validation message, got %v", err)
	}
}

func TestValidateProductionRejectsLocalhostCORS(t *testing.T) {
	cfg := Config{
		AppEnv:             "production",
		AppPort:            "8080",
		CORSAllowedOrigins: []string{"https://mail.example.com", "http://localhost:5173"},
		MySQLDSN:           "app:strong-password@tcp(mysql:3306)/shiro_email?parseTime=true",
		RedisAddr:          "redis:6379",
		RedisPassword:      "redis-password",
		JWTSecret:          "0123456789abcdefghijklmnopqrstuvwxyz",
		MetricsToken:       "metrics-token",
		MailStoragePath:    "/app/data/mail",
	}

	err := cfg.Validate()
	if err == nil {
		t.Fatal("expected localhost CORS validation error")
	}
	if !strings.Contains(err.Error(), "CORS_ALLOWED_ORIGINS") {
		t.Fatalf("expected CORS_ALLOWED_ORIGINS validation message, got %v", err)
	}
}

func TestValidateProductionAcceptsHardenedConfig(t *testing.T) {
	cfg := Config{
		AppEnv:             "production",
		AppPort:            "8080",
		CORSAllowedOrigins: []string{"https://mail.example.com"},
		MySQLDSN:           "app:strong-password@tcp(mysql:3306)/shiro_email?parseTime=true",
		RedisAddr:          "redis:6379",
		RedisPassword:      "redis-password",
		JWTSecret:          "0123456789abcdefghijklmnopqrstuvwxyz",
		MetricsToken:       "metrics-token",
		MailStoragePath:    "/app/data/mail",
	}

	if err := cfg.Validate(); err != nil {
		t.Fatalf("expected hardened production config to pass, got %v", err)
	}
}
