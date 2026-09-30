package testutil

import (
	"context"
	"github.com/google/uuid"
	"github.com/robbinsz/bgeo/internal/config"
	"github.com/robbinsz/bgeo/internal/repository"
	"gorm.io/gorm"
	"net/url"
	"os"
	"path/filepath"
	"testing"
)

// A fresh schema per test prevents fixtures from touching any existing table.
func Database(t *testing.T) *gorm.DB {
	t.Helper()
	cfg := config.Config{DBDriver: "sqlite", SQLitePath: filepath.Join(t.TempDir(), "test.db")}
	var cleanup func()
	if raw := os.Getenv("TEST_POSTGRES_DSN"); raw != "" {
		parsed, err := url.Parse(raw)
		if err != nil || parsed.Scheme != "postgres" {
			t.Fatal("TEST_POSTGRES_DSN must be a PostgreSQL URL for a disposable test database")
		}
		base, err := repository.OpenDatabase(config.Config{DBDriver: "postgres", DatabaseURL: raw})
		if err != nil {
			t.Fatal(err)
		}
		schema := "bgeo_test_" + uuid.NewString()
		schema = stringReplace(schema)
		if err = base.Exec("CREATE SCHEMA " + schema).Error; err != nil {
			t.Fatal(err)
		}
		params := parsed.Query()
		params.Set("search_path", schema)
		parsed.RawQuery = params.Encode()
		cfg.DBDriver = "postgres"
		cfg.DatabaseURL = parsed.String()
		cleanup = func() {
			if err := base.Exec("DROP SCHEMA " + schema + " CASCADE").Error; err != nil {
				t.Error(err)
			}
			conn, _ := base.DB()
			conn.Close()
		}
	}
	db, err := repository.OpenDatabase(cfg)
	if err != nil {
		if cleanup != nil {
			cleanup()
		}
		t.Fatal(err)
	}
	if err = repository.Migrate(context.Background(), db); err != nil {
		if cleanup != nil {
			cleanup()
		}
		t.Fatal(err)
	}
	t.Cleanup(func() {
		conn, _ := db.DB()
		conn.Close()
		if cleanup != nil {
			cleanup()
		}
	})
	return db
}
func stringReplace(value string) string {
	result := []rune{}
	for _, r := range value {
		if r != '-' {
			result = append(result, r)
		}
	}
	return string(result)
}
