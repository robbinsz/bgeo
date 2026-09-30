package main

import (
	"context"
	"fmt"
	"github.com/google/uuid"
	"github.com/robbinsz/bgeo/internal/config"
	"github.com/robbinsz/bgeo/internal/repository"
	"github.com/robbinsz/bgeo/pkg/secretutil"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
	"log"
	"os"
	"strings"
)

func main() {
	if len(os.Args) != 2 {
		log.Fatal("usage: manage migrate|seed-demo|bootstrap|encrypt-credentials")
	}
	cfg, err := config.Load()
	if err != nil {
		log.Fatal(err)
	}
	db, err := repository.OpenDatabase(cfg)
	if err != nil {
		log.Fatal(err)
	}
	conn, _ := db.DB()
	defer conn.Close()
	switch os.Args[1] {
	case "migrate":
		err = repository.Migrate(context.Background(), db)
	case "seed-demo":
		err = repository.VerifySchema(context.Background(), db)
		if err == nil {
			err = repository.SeedDemo(db)
		}
	case "encrypt-credentials":
		if cfg.EncryptionKey == "" {
			err = fmt.Errorf("an explicit persistent CREDENTIAL_ENCRYPTION_KEY is required")
		} else {
			err = encryptCredentials(db)
		}
	case "bootstrap":
		err = repository.VerifySchema(context.Background(), db)
		if err == nil {
			err = bootstrap(db)
		}
	default:
		err = fmt.Errorf("unknown command")
	}
	if err != nil {
		log.Fatal(err)
	}
	log.Printf("%s completed", os.Args[1])
}
func bootstrap(db *gorm.DB) error {
	email := strings.TrimSpace(os.Getenv("BOOTSTRAP_EMAIL"))
	password := os.Getenv("BOOTSTRAP_PASSWORD")
	brand := strings.TrimSpace(os.Getenv("BOOTSTRAP_BRAND"))
	if !strings.Contains(email, "@") || len(password) < 12 || len(password) > 72 || brand == "" {
		return fmt.Errorf("BOOTSTRAP_EMAIL, BOOTSTRAP_PASSWORD (12..72 bytes), BOOTSTRAP_BRAND required")
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	return db.Transaction(func(tx *gorm.DB) error {
		var count int64
		if err := tx.Model(&repository.UserModel{}).Count(&count).Error; err != nil {
			return err
		}
		if count > 0 {
			return fmt.Errorf("bootstrap requires an empty installation; existing accounts are preserved")
		}
		org := repository.OrganizationModel{Name: brand}
		if err := tx.Create(&org).Error; err != nil {
			return err
		}
		user := repository.UserModel{OrganizationID: org.ID, Email: email, Name: "Administrator", Role: "owner", Status: "active", PasswordHash: string(hash)}
		if err := tx.Create(&user).Error; err != nil {
			return err
		}
		project := repository.ProjectModel{BaseGormModel: repository.BaseGormModel{ID: uuid.New()}, OrganizationID: org.ID, Name: brand, BrandName: brand, BrandAliases: "[]", DailySampleLimit: 1000, AutomationLevel: "L1"}
		return tx.Create(&project).Error
	})
}

// Explicit offline migration; credentials never pass through logs or API responses.
func encryptCredentials(db *gorm.DB) error {
	return db.Transaction(func(tx *gorm.DB) error {
		for _, entry := range []struct{ Table, Column string }{{"ai_configs", "api_key"}, {"mcp_servers", "auth_headers"}, {"publish_channel_models", "credential"}} {
			var rows []struct {
				ID    uuid.UUID
				Value string
			}
			if err := tx.Table(entry.Table).Select("id," + entry.Column + " AS value").Scan(&rows).Error; err != nil {
				return err
			}
			for _, row := range rows {
				if row.Value == "" || strings.HasPrefix(row.Value, "enc:v1:") {
					continue
				}
				sealed, err := secretutil.Seal(row.Value)
				if err != nil {
					return err
				}
				if err = tx.Table(entry.Table).Where("id = ?", row.ID).Update(entry.Column, sealed).Error; err != nil {
					return err
				}
			}
		}
		return nil
	})
}
