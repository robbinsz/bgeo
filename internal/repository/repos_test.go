package repository

import (
	"context"
	"fmt"
	"github.com/robbinsz/bgeo/internal/domain"
	"path/filepath"
	"testing"
	"time"

	"github.com/google/uuid"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestRepositories(t *testing.T) {
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "repo_test.db")
	db, err := gorm.Open(sqlite.Open(dbPath), &gorm.Config{})
	if err != nil {
		t.Fatalf("failed to open sqlite: %v", err)
	}

	err = db.AutoMigrate(
		&ProjectModel{},
		&BrandFactModel{},
		&QueryModel{},
		&OpportunityModel{},
		&RuleModel{},
	)
	if err != nil {
		t.Fatalf("failed to automigrate: %v", err)
	}

	ctx := context.Background()
	projID := uuid.New()

	// 1. Test Project Repo
	pRepo := NewProjectRepository(db)
	proj := &ProjectModel{
		BaseGormModel: BaseGormModel{ID: projID},
		Name:          "测试项目",
		BrandName:     "测试品牌",
	}
	_ = db.Create(proj)

	gotProj, err := pRepo.GetProject(ctx, projID)
	if err != nil || gotProj.BrandName != "测试品牌" {
		t.Fatalf("expected to get project, got: %v", gotProj)
	}

	// 2. Test Monitor Queries
	mRepo := NewMonitorRepository(db)
	_ = mRepo.CreateQuery(ctx, &QueryModel{
		BaseGormModel: BaseGormModel{ID: uuid.New()},
		ProjectID:     projID,
		QueryText:     "如何选择家政？",
		Intent:        "commercial",
	})
	queries, err := mRepo.ListQueries(ctx, projID)
	if err != nil || len(queries) != 1 {
		t.Fatalf("expected 1 query, got: %d", len(queries))
	}

	// 3. Test Rules and Approval/Rollback
	eRepo := NewEvolutionRepository(db)
	ruleID := uuid.New()
	rule := &RuleModel{
		BaseGormModel: BaseGormModel{ID: ruleID},
		ProjectID:     projID,
		RuleName:      "本地案例密度提升",
		Category:      "template_strategy",
		ConditionExpr: "query.intent == 'commercial'",
		ActionType:    "append_entities",
		Status:        "candidate",
		Version:       "v2.9-rc1",
		SampleSize:    20,
	}
	_ = eRepo.CreateRule(ctx, rule)

	ctx = domain.WithProject(ctx, projID)
	// Approve rule
	err = eRepo.ApproveRule(ctx, ruleID, "v2.9")
	if err != nil {
		t.Fatalf("failed to approve rule: %v", err)
	}

	rules, _ := eRepo.ListRules(ctx, projID)
	if rules[0].Status != "stable" || rules[0].Version != "v2.9" {
		t.Fatalf("expected rule to be stable v2.9, got status: %s version: %s", rules[0].Status, rules[0].Version)
	}

	// Rollback rule
	err = eRepo.RollbackRule(ctx, ruleID)
	if err != nil {
		t.Fatalf("failed to rollback rule: %v", err)
	}

	rulesAfter, _ := eRepo.ListRules(ctx, projID)
	if rulesAfter[0].Status != "rolled_back" {
		t.Fatalf("expected rule to be rolled_back, got: %s", rulesAfter[0].Status)
	}
}

func TestSnapshotCreation(t *testing.T) {
	tmpDir := t.TempDir()
	db, _ := gorm.Open(sqlite.Open(filepath.Join(tmpDir, "snap.db")), &gorm.Config{})
	_ = db.AutoMigrate(&AnswerSnapshotModel{})

	repo := NewMonitorRepository(db)
	ctx := context.Background()
	projID := uuid.New()
	qID := uuid.New()

	snap := &AnswerSnapshotModel{
		BaseGormModel: BaseGormModel{ID: uuid.New()},
		ProjectID:     projID,
		QueryID:       qID,
		ChannelID:     "deepseek",
		RawAnswer:     "这是测试回答",
		SampledAt:     time.Now(),
	}

	err := repo.SaveSnapshot(ctx, snap)
	if err != nil {
		t.Fatalf("failed to save snapshot: %v", err)
	}

	snaps, err := repo.ListRecentSnapshots(ctx, projID, 10)
	if err != nil || len(snaps) != 1 {
		t.Fatalf("expected 1 snapshot, got %d", len(snaps))
	}
}

func TestDemoSeedAuthorizationAndAtomicFailure(t *testing.T) {
	t.Setenv("APP_MODE", "demo")
	t.Setenv("APP_ENV", "development")
	for _, collision := range []bool{false, true} {
		t.Run(fmt.Sprint(collision), func(t *testing.T) {
			db, err := gorm.Open(sqlite.Open(filepath.Join(t.TempDir(), "seed.db")), &gorm.Config{})
			if err != nil {
				t.Fatal(err)
			}
			if err = Migrate(context.Background(), db); err != nil {
				t.Fatal(err)
			}
			if collision {
				existing := UserModel{BaseGormModel: BaseGormModel{ID: uuid.MustParse("00000000-0000-0000-0000-000000000001")}, Email: "existing@example.com", Role: "owner", Status: "active"}
				if err = db.Create(&existing).Error; err != nil {
					t.Fatal(err)
				}
				if err = SeedDemo(db); err == nil {
					t.Fatal("seed swallowed duplicate account error")
				}
				var count int64
				if err = db.Model(&OrganizationModel{}).Count(&count).Error; err != nil || count != 0 {
					t.Fatal("partial seed was not rolled back", err)
				}
				return
			}
			if err = SeedDemo(db); err != nil {
				t.Fatal(err)
			}
			var user UserModel
			var project ProjectModel
			if err = db.Where("email = ?", "admin@bgeo.cc").First(&user).Error; err != nil {
				t.Fatal(err)
			}
			if err = db.First(&project, "id = ?", DefaultProjectID).Error; err != nil {
				t.Fatal(err)
			}
			if user.OrganizationID == uuid.Nil || project.OrganizationID != user.OrganizationID {
				t.Fatal("demo administrator cannot select demo project")
			}
			if err = SeedDemo(db); err != nil {
				t.Fatal("repeated seed should preserve existing project", err)
			}
		})
	}
}
