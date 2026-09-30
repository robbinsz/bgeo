package config

import (
	"encoding/base64"
	"strings"
	"testing"
)

func TestProductionRejectsUnsafeDefaults(t *testing.T) {
	t.Setenv("APP_ENV", "production")
	t.Setenv("APP_MODE", "live")
	t.Setenv("DB_DRIVER", "sqlite")
	if _, err := Load(); err == nil {
		t.Fatal("production accepted SQLite")
	}
	t.Setenv("DB_DRIVER", "postgres")
	t.Setenv("DATABASE_URL", "postgres://localhost/test")
	t.Setenv("JWT_ACCESS_SECRET", strings.Repeat("a", 32))
	t.Setenv("JWT_REFRESH_SECRET", strings.Repeat("b", 32))
	t.Setenv("CREDENTIAL_ENCRYPTION_KEY", base64.StdEncoding.EncodeToString(make([]byte, 32)))
	t.Setenv("AUTO_MIGRATE", "false")
	t.Setenv("SEED_DEMO", "false")
	if _, err := Load(); err != nil {
		t.Fatal(err)
	}
	t.Setenv("AUTO_MIGRATE", "true")
	if _, err := Load(); err == nil {
		t.Fatal("production accepted automatic migrations")
	}
	t.Setenv("AUTO_MIGRATE", "false")
	t.Setenv("APP_MODE", "demo")
	if _, err := Load(); err == nil {
		t.Fatal("production accepted demo")
	}
}
