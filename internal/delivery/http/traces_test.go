package http

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/robbinsz/bgeo/internal/domain"
	"github.com/robbinsz/bgeo/internal/repository"
	"github.com/robbinsz/bgeo/internal/usecase"
)

type dummyFlusher struct{}

func (f *dummyFlusher) Flush() {}

func TestAgentExecutionTracesFullLifecycle(t *testing.T) {
	router, db, token, _ := setupTestRouter(t)

	projID := repository.DefaultProjectID
	sessionID := uuid.New()
	userID := uuid.MustParse("00000000-0000-0000-0000-000000000001")

	copilotRepo := repository.NewCopilotRepository(db)
	harnessRepo := repository.NewHarnessRepository(db)
	monitorRepo := repository.NewMonitorRepository(db)
	oppRepo := repository.NewOpportunityRepository(db)
	projRepo := repository.NewProjectRepository(db)
	contentRepo := repository.NewContentRepository(db)
	monitorUC := usecase.NewMonitorUsecase(monitorRepo, oppRepo, nil, nil)
	contentUC := usecase.NewContentUsecase(contentRepo, projRepo)

	copilotUC := usecase.NewCopilotUsecase(
		copilotRepo,
		harnessRepo,
		monitorUC,
		contentUC,
		monitorRepo,
		oppRepo,
		projRepo,
		contentRepo,
		nil,
	)

	// Pre-seed a memory entry so memory retrieval step has data
	_ = harnessRepo.CreateMemoryEntry(contextWithTimeout(t), &repository.MemoryEntryModel{
		ProjectID:        projID,
		MemoryType:       "brand_truth",
		Title:            "品牌资质认证",
		Content:          "拥有住建部一级家政资质",
		IsPinned:         true,
		ScoreWeight:      1.0,
		ExtractionSource: "manual",
	})

	// Pre-seed a custom skill
	_ = harnessRepo.CreateCustomSkill(contextWithTimeout(t), &repository.CustomSkillModel{
		ProjectID:   projID,
		SkillID:     "qa-skill",
		Name:        "问答核验技能",
		Description: "专业核验问答内容真实性",
		Content:     "# 技能说明\n核验问答规范",
		IsActive:    true,
	})

	// Execute ChatStream
	var buf bytes.Buffer
	flusher := &dummyFlusher{}

	err := copilotUC.ChatStream(
		contextWithTimeout(t),
		sessionID,
		projID,
		userID,
		"请帮我分析当前落后的 GEO 机会并给出诊断",
		map[string]interface{}{
			"current_route":  "/diagnosis",
			"enabled_skills": []string{"monitor", "diagnosis"},
		},
		&buf,
		flusher,
	)
	if err != nil {
		t.Fatalf("ChatStream failed: %v", err)
	}

	// 1. Verify trace was created in database
	traces, err := copilotRepo.ListExecutionTraces(contextWithTimeout(t), projID, &sessionID, 10)
	if err != nil {
		t.Fatalf("failed to list traces: %v", err)
	}
	if len(traces) == 0 {
		t.Fatalf("expected at least 1 trace record, got 0")
	}

	trace := traces[0]
	if trace.SessionID != sessionID {
		t.Errorf("expected session_id %s, got %s", sessionID, trace.SessionID)
	}
	if trace.UserPrompt != "请帮我分析当前落后的 GEO 机会并给出诊断" {
		t.Errorf("unexpected user prompt: %s", trace.UserPrompt)
	}
	if trace.TimelineJSON == "" {
		t.Fatalf("expected non-empty timeline_json")
	}

	var steps []usecase.ExecutionStep
	if err := json.Unmarshal([]byte(trace.TimelineJSON), &steps); err != nil {
		t.Fatalf("failed to unmarshal timeline_json: %v", err)
	}

	if len(steps) < 3 {
		t.Fatalf("expected at least 3 steps (memory_retrieval, skill_assembly, model_inference), got %d", len(steps))
	}

	// Verify step types
	hasMemory := false
	hasSkill := false
	hasModel := false
	for _, s := range steps {
		if s.StepType == "memory_retrieval" {
			hasMemory = true
		}
		if s.StepType == "skill_assembly" {
			hasSkill = true
		}
		if s.StepType == "model_inference" {
			hasModel = true
		}
	}
	if !hasMemory || !hasSkill || !hasModel {
		t.Errorf("missing expected steps: memory=%v, skill=%v, model=%v", hasMemory, hasSkill, hasModel)
	}

	// 2. Test HTTP GET /api/v1/copilot/traces
	req := httptest.NewRequest(http.MethodGet, "/api/v1/copilot/traces?session_id="+sessionID.String(), nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("GET /copilot/traces failed with code %d: %s", w.Code, w.Body.String())
	}

	var traceListResp struct {
		Items []repository.AgentExecutionTraceModel `json:"items"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &traceListResp); err != nil {
		t.Fatalf("failed to parse traces response: %v", err)
	}
	if len(traceListResp.Items) == 0 {
		t.Fatalf("expected items in API response, got 0")
	}

	// 3. Test HTTP GET /api/v1/copilot/traces/:id
	detailReq := httptest.NewRequest(http.MethodGet, "/api/v1/copilot/traces/"+trace.ID.String(), nil)
	detailReq.Header.Set("Authorization", "Bearer "+token)
	w2 := httptest.NewRecorder()
	router.ServeHTTP(w2, detailReq)

	if w2.Code != http.StatusOK {
		t.Fatalf("GET /copilot/traces/:id failed with code %d: %s", w2.Code, w2.Body.String())
	}

	var detailResp repository.AgentExecutionTraceModel
	if err := json.Unmarshal(w2.Body.Bytes(), &detailResp); err != nil {
		t.Fatalf("failed to parse trace detail response: %v", err)
	}
	if detailResp.ID != trace.ID {
		t.Errorf("expected trace ID %s, got %s", trace.ID, detailResp.ID)
	}
}

func contextWithTimeout(t *testing.T) context.Context {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	t.Cleanup(cancel)
	return domain.WithActor(ctx, domain.Actor{ProjectID: repository.DefaultProjectID, OrganizationID: repository.DefaultOrgID, UserID: uuid.MustParse("00000000-0000-0000-0000-000000000001"), Role: "admin"})
}
