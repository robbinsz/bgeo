package config

import (
	"encoding/base64"
	"fmt"
	"net"
	"os"
	"strconv"
	"strings"
	"time"
)

// Config is validated before opening databases or starting listeners.
type Config struct {
	Environment, Mode, Address, DBDriver, DatabaseURL, SQLitePath string
	AccessSecret, RefreshSecret, EncryptionKey                    string
	AllowedOrigins, TrustedProxies                                []string
	AutoMigrate, SeedDemo                                         bool
	WorkerConcurrency                                             int
	JobTimeout, LeaseDuration                                     time.Duration
}

func Load() (Config, error) {
	c := Config{
		Environment: value("APP_ENV", "development"), Mode: value("APP_MODE", "live"),
		Address: value("HTTP_ADDR", ":8080"), DBDriver: value("DB_DRIVER", "sqlite"),
		DatabaseURL: os.Getenv("DATABASE_URL"), SQLitePath: value("SQLITE_PATH", "data/geopilot.db"),
		AccessSecret: os.Getenv("JWT_ACCESS_SECRET"), RefreshSecret: os.Getenv("JWT_REFRESH_SECRET"),
		EncryptionKey:  os.Getenv("CREDENTIAL_ENCRYPTION_KEY"),
		AllowedOrigins: strings.FieldsFunc(os.Getenv("ALLOWED_ORIGINS"), func(r rune) bool { return r == ',' }),
		TrustedProxies: strings.FieldsFunc(os.Getenv("TRUSTED_PROXIES"), func(r rune) bool { return r == ',' }),
		AutoMigrate:    os.Getenv("AUTO_MIGRATE") == "true", SeedDemo: os.Getenv("SEED_DEMO") == "true",
		WorkerConcurrency: 4, JobTimeout: 15 * time.Minute, LeaseDuration: time.Minute,
	}
	if raw := os.Getenv("WORKER_CONCURRENCY"); raw != "" {
		n, err := strconv.Atoi(raw)
		if err != nil || n < 1 || n > 32 {
			return c, fmt.Errorf("WORKER_CONCURRENCY must be 1..32")
		}
		c.WorkerConcurrency = n
	}
	if c.Mode != "live" && c.Mode != "demo" {
		return c, fmt.Errorf("APP_MODE must be live or demo")
	}
	if c.DBDriver != "postgres" && c.DBDriver != "sqlite" {
		return c, fmt.Errorf("unsupported DB_DRIVER")
	}
	if c.DBDriver == "postgres" && c.DatabaseURL == "" {
		return c, fmt.Errorf("DATABASE_URL is required for PostgreSQL")
	}
	if c.SeedDemo && c.Mode != "demo" {
		return c, fmt.Errorf("SEED_DEMO requires explicit APP_MODE=demo")
	}
	if c.EncryptionKey != "" {
		key, err := base64.StdEncoding.DecodeString(c.EncryptionKey)
		if err != nil || len(key) != 32 {
			return c, fmt.Errorf("CREDENTIAL_ENCRYPTION_KEY must be a base64 encoded 32-byte key")
		}
	}
	if c.Environment == "production" {
		if c.Mode != "live" || c.DBDriver != "postgres" || c.AutoMigrate || c.SeedDemo {
			return c, fmt.Errorf("production requires live mode, PostgreSQL, explicit migrations and no demo seeding")
		}
		if len(c.AccessSecret) < 32 || len(c.RefreshSecret) < 32 || c.AccessSecret == c.RefreshSecret {
			return c, fmt.Errorf("production requires distinct JWT secrets of at least 32 bytes")
		}
		key, err := base64.StdEncoding.DecodeString(c.EncryptionKey)
		if err != nil || len(key) != 32 {
			return c, fmt.Errorf("CREDENTIAL_ENCRYPTION_KEY must be a base64 encoded 32-byte key")
		}
	}
	for i, origin := range c.AllowedOrigins {
		c.AllowedOrigins[i] = strings.TrimSpace(origin)
		if c.AllowedOrigins[i] == "*" {
			return c, fmt.Errorf("ALLOWED_ORIGINS cannot contain a wildcard")
		}
	}
	for i, proxy := range c.TrustedProxies {
		proxy = strings.TrimSpace(proxy)
		if net.ParseIP(proxy) == nil {
			if _, _, err := net.ParseCIDR(proxy); err != nil {
				return c, fmt.Errorf("TRUSTED_PROXIES must contain IP addresses or CIDR ranges")
			}
		}
		c.TrustedProxies[i] = proxy
	}
	return c, nil
}

func Demo() bool { return os.Getenv("APP_MODE") == "demo" && os.Getenv("APP_ENV") != "production" }
func value(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
