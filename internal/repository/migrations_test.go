package repository_test

import (
	"context"
	"github.com/google/uuid"
	"github.com/robbinsz/bgeo/internal/repository"
	"github.com/robbinsz/bgeo/internal/testutil"
	"testing"
)

func TestUpgradePreservesExistingUsersAndAppliesEveryVersion(t *testing.T) {
	db := testutil.Database(t)
	user := repository.UserModel{Email: uuid.NewString() + "@example.test", PasswordHash: "existing-hash", OrganizationID: uuid.New(), Status: "active"}
	if err := db.Create(&user).Error; err != nil {
		t.Fatal(err)
	}
	// Reproduce a version-1 database with the old credential and job columns.
	for _, constraint := range []struct {
		model interface{}
		name  string
	}{{&repository.JobModel{}, "Project"}, {&repository.ProjectMemberModel{}, "Project"}, {&repository.ProjectMemberModel{}, "User"}, {&repository.CopilotMessageModel{}, "Session"}} {
		if err := db.Migrator().DropConstraint(constraint.model, constraint.name); err != nil {
			t.Fatal(err)
		}
	}
	for _, index := range []string{"idx_job_reconciliation", "idx_job_models_reconciled_at"} {
		if db.Migrator().HasIndex(&repository.JobModel{}, index) {
			if err := db.Migrator().DropIndex(&repository.JobModel{}, index); err != nil {
				t.Fatal(err)
			}
		}
	}
	if err := db.Migrator().DropColumn(&repository.UserModel{}, "AuthVersion"); err != nil {
		t.Fatal(err)
	}
	if err := db.Migrator().DropColumn(&repository.JobModel{}, "ReconciledAt"); err != nil {
		t.Fatal(err)
	}
	// Fixture table rebuilds also remove indexes; recreate the version-1 indexes.
	for _, index := range []string{"idx_job_ready", "idx_job_models_idempotency_key"} {
		if !db.Migrator().HasIndex(&repository.JobModel{}, index) {
			if err := db.Migrator().CreateIndex(&repository.JobModel{}, index); err != nil {
				t.Fatal(err)
			}
		}
	}
	if err := db.Exec("CREATE INDEX idx_job_legacy_kind ON job_models (kind)").Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Where("version > 1").Delete(&repository.SchemaMigration{}).Error; err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 2; i++ {
		if err := repository.Migrate(context.Background(), db); err != nil {
			t.Fatal(err)
		}
	}
	var loaded repository.UserModel
	if err := db.First(&loaded, "id = ?", user.ID).Error; err != nil {
		t.Fatal(err)
	}
	if loaded.PasswordHash != "existing-hash" || loaded.AuthVersion != 0 {
		t.Fatalf("existing account changed: %+v", loaded)
	}
	if err := repository.VerifySchema(context.Background(), db); err != nil {
		t.Fatal(err)
	}
	for _, index := range []string{"idx_job_ready", "idx_job_models_idempotency_key", "idx_job_legacy_kind"} {
		if !db.Migrator().HasIndex(&repository.JobModel{}, index) {
			t.Fatalf("migration lost existing index %s", index)
		}
	}
	var count int64
	db.Model(&repository.SchemaMigration{}).Count(&count)
	if count != int64(repository.SchemaVersion) {
		t.Fatalf("expected sequential migration history, got %d", count)
	}
}

func TestSchemaHealthAndRelationshipEnforcement(t *testing.T) {
	db := testutil.Database(t)
	job := repository.JobModel{ProjectID: uuid.New(), Kind: "monitor_run", Status: "queued", Payload: "{}", IdempotencyKey: uuid.NewString()}
	if err := db.Create(&job).Error; err == nil {
		t.Fatal("orphan job accepted")
	}
	message := repository.CopilotMessageModel{SessionID: uuid.New(), Role: "assistant", Content: "orphan"}
	if err := db.Create(&message).Error; err == nil {
		t.Fatal("orphan conversation message accepted")
	}
	if err := db.Migrator().DropTable(&repository.PublicationModel{}); err != nil {
		t.Fatal(err)
	}
	if err := repository.VerifySchema(context.Background(), db); err == nil {
		t.Fatal("ready check accepted a missing table")
	}
}
