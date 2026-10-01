package usecase

import (
	"context"
	"encoding/json"
	"fmt"
	"github.com/robbinsz/bgeo/internal/domain"
	"github.com/robbinsz/bgeo/pkg/ruleengine"
	"github.com/robbinsz/bgeo/pkg/secretutil"
	"html"
	"regexp"
	"strings"

	"github.com/google/uuid"
	"github.com/robbinsz/bgeo/internal/repository"
)

type ContentUsecase struct {
	contentRepo *repository.ContentRepository
	projectRepo *repository.ProjectRepository
}

func NewContentUsecase(cRepo *repository.ContentRepository, pRepo *repository.ProjectRepository) *ContentUsecase {
	return &ContentUsecase{
		contentRepo: cRepo,
		projectRepo: pRepo,
	}
}

type QualityCheckResult struct {
	Passed           bool                `json:"passed"`
	FactMatches      int                 `json:"fact_matches"`
	ForbiddenHits    []string            `json:"forbidden_hits"`
	VerifiedSources  []string            `json:"verified_sources"`
	ReadabilityScore int                 `json:"readability_score"`
	UnverifiedClaims []string            `json:"unverified_claims"`
	Evidence         map[string][]string `json:"evidence"`
	ContentHash      string              `json:"content_hash"`
}

// VerifyContentFacts checks content body against approved brand facts & sensitive words
func (uc *ContentUsecase) VerifyContentFacts(ctx context.Context, projectID uuid.UUID, content string) (*QualityCheckResult, error) {
	facts, err := uc.projectRepo.ListBrandFacts(ctx, projectID)
	if err != nil {
		return nil, err
	}

	result := &QualityCheckResult{Passed: false, ForbiddenHits: []string{}, VerifiedSources: []string{}, UnverifiedClaims: []string{}, Evidence: map[string][]string{}, ContentHash: secretutil.Digest(content)}
	sentences := regexp.MustCompile("[。！？\n]+").Split(content, -1)
	prefix := regexp.MustCompile(`^\s*(?:[-*]|[0-9]+[.)、])\s*`)
	for _, raw := range sentences {
		statement := strings.TrimSpace(raw)
		if statement == "" {
			continue
		}
		// Headings are visible claims too. Never exempt them from evidence checks.
		statement = strings.TrimSpace(strings.TrimLeft(statement, "#"))
		statement = prefix.ReplaceAllString(statement, "")
		statement = html.UnescapeString(strings.TrimSpace(statement))
		if statement == "" {
			continue
		}
		matched := false
		for _, f := range facts {
			if strings.TrimSpace(strings.TrimRight(f.Statement, "。！？")) == statement && strings.TrimSpace(f.Source) != "" {
				result.FactMatches++
				result.VerifiedSources = append(result.VerifiedSources, f.Source)
				result.Evidence[statement] = append(result.Evidence[statement], f.ID.String())
				matched = true
				break
			}
		}
		if !matched {
			result.UnverifiedClaims = append(result.UnverifiedClaims, statement)
		}
	}
	result.Passed = result.FactMatches > 0 && len(result.UnverifiedClaims) == 0

	// 2. Check forbidden advertising words
	forbiddenList := []string{
		"国家级最高", "全网最低价", "百分之百无害", "绝对无故障",
		"全网第一", "第一品牌", "顶级", "最好", "极品", "独家绝版", "绝无仅有",
		"全网首家", "最具权威", "无敌",
	}
	for _, fb := range forbiddenList {
		if strings.Contains(content, fb) {
			result.Passed = false
			result.ForbiddenHits = append(result.ForbiddenHits, fb)
		}
	}

	return result, nil
}

// VerifyAssetFacts includes the title in the approved version's evidence boundary.
func (uc *ContentUsecase) VerifyAssetFacts(ctx context.Context, projectID uuid.UUID, title, body string) (*QualityCheckResult, error) {
	return uc.VerifyContentFacts(ctx, projectID, title+"\n"+body)
}

// CreateContentAsset creates a new content draft and performs auto fact validation
func (uc *ContentUsecase) CreateContentAsset(ctx context.Context, projectID uuid.UUID, title, assetType, body string, brief map[string]interface{}) (*repository.ContentAssetModel, error) {
	if brief == nil {
		brief = map[string]interface{}{}
	}
	body, err := uc.applyStableRules(ctx, projectID, body, brief)
	if err != nil {
		return nil, err
	}
	qc, err := uc.VerifyAssetFacts(ctx, projectID, title, body)
	if err != nil {
		return nil, err
	}
	qcBytes, _ := json.Marshal(qc)
	briefBytes, _ := json.Marshal(brief)

	status := "draft"
	if qc != nil && qc.Passed {
		status = "pending_approval"
	}

	asset := &repository.ContentAssetModel{
		BaseGormModel: repository.BaseGormModel{ID: uuid.New()},
		ProjectID:     projectID,
		Title:         title,
		AssetType:     assetType,
		Brief:         string(briefBytes),
		ContentBody:   body,
		Version:       1,
		QualityChecks: string(qcBytes),
		Status:        status,
	}

	err = uc.contentRepo.CreateAsset(ctx, asset)
	return asset, err
}

func (uc *ContentUsecase) applyStableRules(ctx context.Context, projectID uuid.UUID, body string, brief map[string]interface{}) (string, error) {
	var rules []repository.RuleModel
	if err := uc.projectRepo.DB().WithContext(ctx).Where("project_id = ? AND status = 'stable'", projectID).Order("created_at,id").Find(&rules).Error; err != nil {
		return "", err
	}
	facts, err := uc.projectRepo.ListBrandFacts(ctx, projectID)
	if err != nil {
		return "", err
	}
	applied := []string{}
	intent, _ := brief["intent"].(string)
	for _, rule := range rules {
		matched, err := ruleengine.NewEvaluator().EvaluateCondition(rule.ConditionExpr, map[string]interface{}{"query": map[string]interface{}{"intent": intent}, "content": map[string]interface{}{"has_pricing": strings.Contains(body, "价格") || strings.Contains(body, "计价")}})
		if err != nil {
			return "", err
		}
		if !matched {
			continue
		}
		if rule.ActionType != "append_evidence_citation" {
			return "", fmt.Errorf("%w: unsupported stable rule action", domain.ErrInvalid)
		}
		var payload struct {
			FactID string `json:"fact_id"`
		}
		if err := json.Unmarshal([]byte(rule.ActionPayload), &payload); err != nil {
			return "", err
		}
		found := false
		for _, fact := range facts {
			if fact.ID.String() == payload.FactID && fact.Source != "" {
				if !strings.Contains(body, fact.Statement) {
					body += "\n" + fact.Statement
				}
				applied = append(applied, rule.ID.String())
				found = true
				break
			}
		}
		if !found {
			return "", fmt.Errorf("%w: stable rule fact is unavailable", domain.ErrConflict)
		}
	}
	brief["applied_rule_ids"] = applied
	return body, nil
}
