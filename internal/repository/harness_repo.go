package repository

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/robbinsz/bgeo/internal/domain"
	"github.com/robbinsz/bgeo/pkg/secretutil"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// HarnessRepository handles HarnessConfig, MCPServer, and MemoryEntry CRUD
type HarnessRepository struct {
	db *gorm.DB
}

func NewHarnessRepository(db *gorm.DB) *HarnessRepository {
	return &HarnessRepository{db: db}
}

// ─── HarnessConfig ────────────────────────────────────────────────────────────

// GetOrCreateConfig returns the harness config for a project, creating defaults if absent
func (r *HarnessRepository) GetOrCreateConfig(ctx context.Context, projectID uuid.UUID) (*HarnessConfigModel, error) {
	var cfg HarnessConfigModel
	err := r.db.WithContext(ctx).Where("project_id = ?", projectID).First(&cfg).Error
	if err == nil {
		return &cfg, nil
	}
	if err != gorm.ErrRecordNotFound {
		return nil, err
	}
	// Create default config
	cfg = HarnessConfigModel{
		BaseGormModel:   BaseGormModel{ID: uuid.New()},
		ProjectID:       projectID,
		EnabledSkills:   `["monitor","diagnosis","content","evolution"]`,
		MaxHistoryTurns: 10,
		AutoSummarize:   true,
	}
	if err2 := r.db.WithContext(ctx).Clauses(clause.OnConflict{Columns: []clause.Column{{Name: "project_id"}}, DoNothing: true}).Create(&cfg).Error; err2 != nil {
		return nil, err2
	}
	if err := r.db.WithContext(ctx).Where("project_id = ?", projectID).First(&cfg).Error; err != nil {
		return nil, err
	}
	return &cfg, nil
}

// UpdateConfig persists updates to harness config fields
func (r *HarnessRepository) UpdateConfig(ctx context.Context, projectID uuid.UUID, updates map[string]interface{}) error {
	return r.db.WithContext(ctx).
		Model(&HarnessConfigModel{}).
		Where("project_id = ?", projectID).
		Updates(updates).Error
}

// ─── MCPServer ────────────────────────────────────────────────────────────────

func (r *HarnessRepository) ListMCPServers(ctx context.Context, projectID uuid.UUID) ([]MCPServerModel, error) {
	var servers []MCPServerModel
	err := r.db.WithContext(ctx).
		Where("project_id = ?", projectID).
		Order("created_at asc").
		Scopes(PageScope(ctx)).Find(&servers).Error
	return servers, err
}

func (r *HarnessRepository) GetMCPServer(ctx context.Context, id uuid.UUID) (*MCPServerModel, error) {
	var srv MCPServerModel
	err := r.db.WithContext(ctx).Where("id = ? AND project_id = ?", id, domain.ActorFrom(ctx).ProjectID).First(&srv).Error
	return &srv, err
}

func (r *HarnessRepository) CreateMCPServer(ctx context.Context, srv *MCPServerModel) error {
	if srv.ID == uuid.Nil {
		srv.ID = uuid.New()
	}
	return r.db.WithContext(ctx).Create(srv).Error
}

func (r *HarnessRepository) UpdateMCPServer(ctx context.Context, id uuid.UUID, updates map[string]interface{}) error {
	if value, ok := updates["auth_headers"].(string); ok {
		encrypted, err := secretutil.Seal(value)
		if err != nil {
			return err
		}
		updates["auth_headers"] = encrypted
	}
	return r.db.WithContext(ctx).
		Model(&MCPServerModel{}).
		Where("id = ? AND project_id = ?", id, domain.ActorFrom(ctx).ProjectID).
		Updates(updates).Error
}

func (r *HarnessRepository) DeleteMCPServer(ctx context.Context, id uuid.UUID) error {
	return r.db.WithContext(ctx).Where("id = ? AND project_id = ?", id, domain.ActorFrom(ctx).ProjectID).Delete(&MCPServerModel{}).Error
}

// UpdateMCPToolsCache persists the fetched tools list and updates ping timestamp
func (r *HarnessRepository) UpdateMCPToolsCache(ctx context.Context, id uuid.UUID, tools []map[string]interface{}) error {
	b, _ := json.Marshal(tools)
	now := time.Now()
	return r.db.WithContext(ctx).
		Model(&MCPServerModel{}).
		Where("id = ? AND project_id = ?", id, domain.ActorFrom(ctx).ProjectID).
		Updates(map[string]interface{}{
			"cached_tools": string(b),
			"last_ping_at": now,
		}).Error
}

// ─── MemoryEntry ─────────────────────────────────────────────────────────────

func (r *HarnessRepository) ListMemoryEntries(ctx context.Context, projectID uuid.UUID, memType string) ([]MemoryEntryModel, error) {
	var entries []MemoryEntryModel
	q := r.db.WithContext(ctx).Where("project_id = ?", projectID)
	if memType != "" {
		q = q.Where("memory_type = ?", memType)
	}
	err := q.Order("is_pinned desc, score_weight desc, created_at desc").Scopes(PageScope(ctx)).Find(&entries).Error
	return entries, err
}

func (r *HarnessRepository) FindMemoryByTitle(ctx context.Context, projectID uuid.UUID, title string) (*MemoryEntryModel, error) {
	var entry MemoryEntryModel
	err := r.db.WithContext(ctx).Where("project_id = ? AND title = ?", projectID, title).First(&entry).Error
	if err != nil {
		return nil, err
	}
	return &entry, nil
}

func (r *HarnessRepository) CreateMemoryEntry(ctx context.Context, entry *MemoryEntryModel) error {
	if entry.ID == uuid.Nil {
		entry.ID = uuid.New()
	}
	if entry.ExtractionSource == "" {
		entry.ExtractionSource = "manual"
	}
	return r.db.WithContext(ctx).Create(entry).Error
}

func (r *HarnessRepository) UpdateMemoryEntry(ctx context.Context, id uuid.UUID, updates map[string]interface{}) error {
	updates["status"] = "pending"
	updates["version"] = gorm.Expr("version + 1")
	return r.db.WithContext(ctx).
		Model(&MemoryEntryModel{}).
		Where("id = ? AND project_id = ?", id, domain.ActorFrom(ctx).ProjectID).
		Updates(updates).Error
}

func (r *HarnessRepository) DeleteMemoryEntry(ctx context.Context, id uuid.UUID) error {
	return r.db.WithContext(ctx).Where("id = ? AND project_id = ?", id, domain.ActorFrom(ctx).ProjectID).Delete(&MemoryEntryModel{}).Error
}

// BuildMemoryContext assembles a system-prompt-ready string from memory entries
// ordered: brand_truth first (pinned), then user_pref, then episodic_strategy
func (r *HarnessRepository) BuildMemoryContext(ctx context.Context, projectID uuid.UUID) string {
	entries, err := r.ListMemoryEntries(ctx, projectID, "")
	if err != nil {
		return ""
	}
	if len(entries) == 0 {
		return ""
	}

	var parts []string
	parts = append(parts, "\n--- 三层长期知识与经验记忆库 (智能体自进化与Hook沉淀) ---")
	for _, e := range entries {
		if e.Status != "approved" || e.MemoryType == "brand_truth" {
			continue
		}
		label := map[string]string{
			"brand_truth":       "[品牌事实]",
			"user_pref":         "[运营偏好]",
			"episodic_strategy": "[历史策略]",
		}[e.MemoryType]
		if label == "" {
			label = "[记忆]"
		}
		sourceTag := ""
		if e.ExtractionSource == "agent_hook" {
			sourceTag = "(Hook沉淀)"
		}
		parts = append(parts, fmt.Sprintf("%s%s %s: %s", label, sourceTag, e.Title, e.Content))
	}
	return strings.Join(parts, "\n")
}

// ─── Custom Skills ────────────────────────────────────────────────────────────

func (r *HarnessRepository) ListCustomSkills(ctx context.Context, projectID uuid.UUID) ([]CustomSkillModel, error) {
	var list []CustomSkillModel
	err := r.db.WithContext(ctx).
		Where("project_id = ?", projectID).
		Order("created_at desc").
		Scopes(PageScope(ctx)).Find(&list).Error
	return list, err
}

func (r *HarnessRepository) GetCustomSkill(ctx context.Context, id uuid.UUID) (*CustomSkillModel, error) {
	var skill CustomSkillModel
	err := r.db.WithContext(ctx).Where("id = ? AND project_id = ?", id, domain.ActorFrom(ctx).ProjectID).First(&skill).Error
	if err != nil {
		return nil, err
	}
	return &skill, nil
}

func (r *HarnessRepository) CreateCustomSkill(ctx context.Context, skill *CustomSkillModel) error {
	return r.db.WithContext(ctx).Create(skill).Error
}

func (r *HarnessRepository) DeleteCustomSkill(ctx context.Context, id uuid.UUID) error {
	return r.db.WithContext(ctx).Where("id = ? AND project_id = ?", id, domain.ActorFrom(ctx).ProjectID).Delete(&CustomSkillModel{}).Error
}

func (r *HarnessRepository) UpdateCustomSkill(ctx context.Context, id uuid.UUID, updates map[string]interface{}) error {
	return r.db.WithContext(ctx).
		Model(&CustomSkillModel{}).
		Where("id = ? AND project_id = ?", id, domain.ActorFrom(ctx).ProjectID).
		Updates(updates).Error
}

func (r *HarnessRepository) ToggleCustomSkill(ctx context.Context, id uuid.UUID) (*CustomSkillModel, error) {
	skill, err := r.GetCustomSkill(ctx, id)
	if err != nil {
		return nil, err
	}
	skill.IsActive = !skill.IsActive
	err = r.db.WithContext(ctx).Model(&CustomSkillModel{}).Where("id = ? AND project_id = ?", id, domain.ActorFrom(ctx).ProjectID).Update("is_active", skill.IsActive).Error
	return skill, err
}

// BuildCustomSkillsPrompt gathers instructions from all active custom skills
func (r *HarnessRepository) BuildCustomSkillsPrompt(ctx context.Context, projectID uuid.UUID) string {
	skills, _ := r.ListCustomSkills(ctx, projectID)
	if len(skills) == 0 {
		return ""
	}
	var parts []string
	hasActive := false
	for _, s := range skills {
		if s.IsActive && s.Content != "" {
			if !hasActive {
				parts = append(parts, "\n--- 挂载的自定义技能指引 (Custom Skills) ---")
				hasActive = true
			}
			parts = append(parts, fmt.Sprintf("【技能: %s】\n%s", s.Name, s.Content))
		}
	}
	if !hasActive {
		return ""
	}
	return strings.Join(parts, "\n\n")
}
