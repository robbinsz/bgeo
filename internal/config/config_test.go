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

func TestTrustedProxiesRequireExplicitIPAddressesOrNetworks(t *testing.T) {
	t.Setenv("APP_ENV", "development")
	t.Setenv("APP_MODE", "live")
	t.Setenv("DB_DRIVER", "sqlite")
	t.Setenv("SEED_DEMO", "false")
	t.Setenv("CREDENTIAL_ENCRYPTION_KEY", "")
	t.Setenv("TRUSTED_PROXIES", "")
	if cfg, err := Load(); err != nil || len(cfg.TrustedProxies) != 0 {
		t.Fatal("default must not trust forwarding headers", err)
	}
	t.Setenv("TRUSTED_PROXIES", "172.16.0.0/12, 127.0.0.1, ::1")
	if cfg, err := Load(); err != nil || len(cfg.TrustedProxies) != 3 || cfg.TrustedProxies[1] != "127.0.0.1" {
		t.Fatal("valid proxy addresses rejected", err)
	}
	t.Setenv("TRUSTED_PROXIES", "gateway")
	if _, err := Load(); err == nil {
		t.Fatal("proxy hostnames must not be accepted as trusted networks")
	}
}
