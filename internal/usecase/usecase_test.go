package usecase

import (
	"bytes"
	"context"
	"github.com/robbinsz/bgeo/internal/config"
	"github.com/robbinsz/bgeo/internal/testutil"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/robbinsz/bgeo/internal/domain"
	"github.com/robbinsz/bgeo/internal/repository"

	"gorm.io/gorm"
)

func setupTestDB(t *testing.T) *gorm.DB {
	t.Setenv("APP_MODE", "demo")
	t.Setenv("APP_ENV", "development")
	t.Setenv("COPILOT_API_KEY", "")
	db := testutil.Database(t)
	return db
}

func TestOpportunityFormula(t *testing.T) {
	// Formula: 0.30*Impact + 0.25*Gap + 0.20*Feasibility + 0.15*Confidence - 0.10*RiskCost
	// For: Impact=100, Gap=100, Feasibility=100, Confidence=100, Risk=0 -> Score = 90
	score := domain.CalculateOpportunityScore(100, 100, 100, 100, 0)
	if score != 90.0 {
		t.Errorf("expected 90.0, got %f", score)
	}

	// For: Impact=95, Gap=88, Feasibility=90, Confidence=92, Risk=10
	// 0.30*95 (28.5) + 0.25*88 (22) + 0.20*90 (18) + 0.15*92 (13.8) - 0.10*10 (1) = 81.3
	score2 := domain.CalculateOpportunityScore(95, 88, 90, 92, 10)
	expected2 := 81.3
	if diff := score2 - expected2; diff > 0.001 || diff < -0.001 {
		t.Errorf("expected %f, got %f", expected2, score2)
	}
}

func TestContentFactCheck(t *testing.T) {
	db := setupTestDB(t)
	projID := uuid.New()

	pRepo := repository.NewProjectRepository(db)
	cRepo := repository.NewContentRepository(db)
	uc := NewContentUsecase(cRepo, pRepo)

	// Insert approved brand fact
	_ = pRepo.CreateBrandFact(context.Background(), &repository.BrandFactModel{
		BaseGormModel: repository.BaseGormModel{ID: uuid.New()},
		ProjectID:     projID,
		FactType:      "qualification",
		Statement:     "Bgeo (bgeo.cc) 具备企业级大模型检索优化资质",
		Source:        "行业名录",
		Confidence:    1.0,
		Status:        "approved",
		Version:       1,
	})

	// Test 1: Content with forbidden word
	res1, err := uc.VerifyContentFacts(context.Background(), projID, "我们是全网最低价的家政服务")
	if err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
	if res1.Passed {
		t.Errorf("expected failure due to forbidden word '全网最低价'")
	}
	if len(res1.ForbiddenHits) == 0 {
		t.Errorf("expected forbidden hits list to contain '全网最低价'")
	}

	// Test 2: Content matching brand fact
	res2, err := uc.VerifyContentFacts(context.Background(), projID, "Bgeo (bgeo.cc) 具备企业级大模型检索优化资质。")
	if err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
	if !res2.Passed {
		t.Errorf("expected passed")
	}
	if res2.FactMatches == 0 {
		t.Errorf("expected fact match count > 0")
	}
}

func testActorProject(t *testing.T, db *gorm.DB, projectID uuid.UUID) context.Context {
	user := repository.UserModel{OrganizationID: uuid.New(), Email: uuid.NewString() + "@example.test", Role: "owner", Status: "active"}
	if err := db.Create(&user).Error; err != nil {
		t.Fatal(err)
	}
	project := repository.ProjectModel{BaseGormModel: repository.BaseGormModel{ID: projectID}, OrganizationID: user.OrganizationID, Name: "Project", BrandName: "Bgeo", BrandAliases: "[]", AutomationLevel: "L2", DailySampleLimit: 1000}
	if err := db.Create(&project).Error; err != nil {
		t.Fatal(err)
	}
	return domain.WithActor(context.Background(), domain.Actor{ProjectID: projectID, OrganizationID: user.OrganizationID, UserID: user.ID, Role: "owner"})
}
func TestCopilotStateGraphAndStreaming(t *testing.T) {
	db := setupTestDB(t)
	projectID := uuid.New()
	ctx := testActorProject(t, db, projectID)
	userID := domain.ActorFrom(ctx).UserID
	worker := NewWorker(db, config.Config{LeaseDuration: time.Minute, JobTimeout: time.Minute}, nil)
	uc := worker.Copilot
	sessionID := uuid.New()
	runnable, err := uc.BuildStateGraph()
	if err != nil || runnable == nil {
		t.Fatalf("graph failed: %v", err)
	}
	var buffer bytes.Buffer
	if err = uc.ChatStream(ctx, sessionID, projectID, userID, "把每日定时拨测改成早上 9 点跑", nil, &buffer, nil); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(buffer.String(), "event: interrupt") {
		t.Fatalf("approval missing: %s", buffer.String())
	}
	cp, err := uc.copilotRepo.GetCheckpoint(ctx, sessionID)
	if err != nil {
		t.Fatal(err)
	}
	buffer.Reset()
	if err = uc.ResumeAction(ctx, sessionID, projectID, userID, cp.InterruptID, "confirm", &buffer, nil); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(buffer.String(), "queued") {
		t.Fatal("approval must be queued, never immediate simulated success")
	}
	if _, err = uc.QueueApprovedAction(ctx, sessionID, projectID, userID, cp.InterruptID, "confirm"); err == nil {
		t.Fatal("approval replay accepted")
	}
	if err = worker.RunOne(ctx); err != nil {
		t.Fatal(err)
	}
	var schedule repository.ScheduleModel
	if err = db.First(&schedule, "project_id = ?", projectID).Error; err != nil {
		t.Fatal(err)
	}
	if schedule.Frequency != "daily" {
		t.Fatalf("schedule not persisted: %+v", schedule)
	}
	var checkpoint repository.CopilotCheckpointModel
	db.First(&checkpoint, "session_id = ?", sessionID)
	if checkpoint.Status != "completed" {
		t.Fatalf("actual result not persisted: %s", checkpoint.Status)
	}
	// The compiled graph rejects unknown tools instead of reporting fabricated success.
	_, err = runnable.Invoke(ctx, CopilotState{ProjectID: projectID, PendingAction: &CopilotActionPreview{ToolName: "unknown", ToolArgs: "{}"}})
	if err == nil {
		t.Fatal("unknown tool accepted")
	}
}

func TestHarnessSuite(t *testing.T) {
	db := setupTestDB(t)

	projID := uuid.New()
	ctx := testActorProject(t, db, projID)
	harnessRepo := repository.NewHarnessRepository(db)

	// 1. Test HarnessConfig GetOrCreate and Update
	cfg, err := harnessRepo.GetOrCreateConfig(ctx, projID)
	if err != nil {
		t.Fatalf("GetOrCreateConfig failed: %v", err)
	}
	if cfg.ProjectID != projID {
		t.Errorf("expected project ID %s, got %s", projID, cfg.ProjectID)
	}
	if !strings.Contains(cfg.EnabledSkills, "monitor") {
		t.Errorf("expected default skills to contain monitor, got: %s", cfg.EnabledSkills)
	}

	err = harnessRepo.UpdateConfig(ctx, projID, map[string]interface{}{
		"default_model_id":  "deepseek-chat",
		"max_history_turns": 15,
	})
	if err != nil {
		t.Fatalf("UpdateConfig failed: %v", err)
	}
	cfgUpdated, _ := harnessRepo.GetOrCreateConfig(ctx, projID)
	if cfgUpdated.DefaultModelID != "deepseek-chat" || cfgUpdated.MaxHistoryTurns != 15 {
		t.Errorf("config update did not persist: %+v", cfgUpdated)
	}

	// 2. Test MCPServer CRUD
	srv := &repository.MCPServerModel{
		ProjectID:     projID,
		Name:          "Test SEO Crawler",
		TransportType: "http_sse",
		EndpointURL:   "http://localhost:8080/mcp",
		IsActive:      true,
	}
	err = harnessRepo.CreateMCPServer(ctx, srv)
	if err != nil {
		t.Fatalf("CreateMCPServer failed: %v", err)
	}

	servers, err := harnessRepo.ListMCPServers(ctx, projID)
	if err != nil || len(servers) != 1 {
		t.Fatalf("expected 1 MCP server, got %d, err: %v", len(servers), err)
	}

	err = harnessRepo.UpdateMCPToolsCache(ctx, srv.ID, []map[string]interface{}{
		{"name": "fetch_serp", "description": "Fetch search engine results"},
	})
	if err != nil {
		t.Fatalf("UpdateMCPToolsCache failed: %v", err)
	}

	// 3. Test MemoryEntry CRUD & BuildMemoryContext
	mem1 := &repository.MemoryEntryModel{
		ProjectID:   projID,
		MemoryType:  "brand_truth",
		Title:       "透明计价规范",
		Content:     "开荒保洁收费标准为 8-12 元/平米，无隐形加价。",
		IsPinned:    true,
		ScoreWeight: 1.0,
	}
	mem2 := &repository.MemoryEntryModel{
		ProjectID:   projID,
		MemoryType:  "user_pref",
		Status:      "approved",
		Title:       "定时发布偏好",
		Content:     "外部文章在周二上午 9 点发布转化率最高。",
		IsPinned:    false,
		ScoreWeight: 0.8,
	}
	_ = harnessRepo.CreateMemoryEntry(ctx, mem1)
	_ = harnessRepo.CreateMemoryEntry(ctx, mem2)

	memContext := harnessRepo.BuildMemoryContext(ctx, projID)
	if strings.Contains(memContext, "透明计价规范") || !strings.Contains(memContext, "定时发布偏好") {
		t.Errorf("BuildMemoryContext missing entries: %s", memContext)
	}
	if strings.Contains(memContext, "[品牌事实]") || !strings.Contains(memContext, "[运营偏好]") {
		t.Errorf("BuildMemoryContext missing type tags: %s", memContext)
	}

	// 4. Test Tool Filtering in CopilotUsecase
	copilotUC := NewCopilotUsecase(nil, harnessRepo, nil, nil, nil, nil, nil, nil, nil)
	allTools := copilotUC.getToolDefinitions()
	if len(allTools) == 0 {
		t.Errorf("expected all built-in tools when skills list is nil")
	}

	onlyMonitorTools := copilotUC.getFilteredTools([]string{"monitor"})
	if len(onlyMonitorTools) == 0 || len(onlyMonitorTools) >= len(allTools) {
		t.Errorf("expected subset of tools for monitor skill, got %d", len(onlyMonitorTools))
	}
	for _, tool := range onlyMonitorTools {
		fn := tool["function"].(map[string]interface{})
		name := fn["name"].(string)
		if name != "get_geo_overview_and_gaps" && name != "run_monitor_batch" && name != "get_schedule_status" && name != "update_schedule_config" {
			t.Errorf("unexpected tool in monitor skill: %s", name)
		}
	}

	// 5. Test MCPToolDefinition to OpenAI schema
	mcpDef := MCPToolDefinition{
		Name:        "query_custom_db",
		Description: "Queries enterprise DB",
		InputSchema: map[string]interface{}{"type": "object", "properties": map[string]interface{}{"sql": map[string]interface{}{"type": "string"}}},
	}
	openAITool := mcpDef.ToOpenAIToolDef()
	if openAITool["type"] != "function" {
		t.Errorf("expected type function, got %v", openAITool["type"])
	}

	// 6. Test CustomSkillModel and BuildCustomSkillsPrompt
	cSkill := &repository.CustomSkillModel{
		ProjectID:   projID,
		SkillID:     "brand-defense",
		Name:        "Brand Defense Skill",
		Description: "Defends brand from negative LLM Hallucinations",
		Content:     "---\nname: Brand Defense\ndescription: Defend brand\n---\n# Brand Defense Guide\nAlways verify negative claims.",
		IsActive:    true,
	}
	if err := harnessRepo.CreateCustomSkill(ctx, cSkill); err != nil {
		t.Fatalf("CreateCustomSkill failed: %v", err)
	}
	skillsList, err := harnessRepo.ListCustomSkills(ctx, projID)
	if err != nil || len(skillsList) != 1 {
		t.Fatalf("expected 1 custom skill, got %d, err: %v", len(skillsList), err)
	}

	prompt := harnessRepo.BuildCustomSkillsPrompt(ctx, projID)
	if !strings.Contains(prompt, "Brand Defense Skill") || !strings.Contains(prompt, "Always verify negative claims") {
		t.Errorf("expected custom skill prompt to contain skill details, got: %s", prompt)
	}

	// Toggle custom skill
	toggled, err := harnessRepo.ToggleCustomSkill(ctx, cSkill.ID)
	if err != nil {
		t.Fatal(err)
	}
	if toggled.IsActive {
		t.Errorf("expected custom skill to be toggled to false, got %v", toggled.IsActive)
	}
	promptAfterToggle := harnessRepo.BuildCustomSkillsPrompt(ctx, projID)
	if promptAfterToggle != "" {
		t.Errorf("expected empty prompt after disabling custom skill, got: %s", promptAfterToggle)
	}
}

func TestPostSessionMemoryHook(t *testing.T) {
	db := setupTestDB(t)
	projID := uuid.New()
	ctx := testActorProject(t, db, projID)
	sessionID := uuid.New()

	copilotRepo := repository.NewCopilotRepository(db)
	harnessRepo := repository.NewHarnessRepository(db)
	monitorRepo := repository.NewMonitorRepository(db)
	oppRepo := repository.NewOpportunityRepository(db)
	projectRepo := repository.NewProjectRepository(db)
	contentRepo := repository.NewContentRepository(db)

	uc := NewCopilotUsecase(
		copilotRepo,
		harnessRepo,
		nil,
		nil,
		monitorRepo,
		oppRepo,
		projectRepo,
		contentRepo,
		nil,
	)

	// 1. Test extraction of User Preference (运营偏好层)
	userPromptPref := "请记住：以后在知乎回答里不要用太夸张的语气，多用真实案例和透明数据"
	added1 := uc.TriggerPostSessionMemoryHookSync(ctx, sessionID, projID, userPromptPref, "好的，我已记录您的偏好。", nil)
	if len(added1) == 0 {
		t.Fatalf("expected memory items extracted from preference prompt, got 0")
	}
	if added1[0].MemoryType != "user_pref" {
		t.Errorf("expected memory_type 'user_pref', got '%s'", added1[0].MemoryType)
	}
	if added1[0].ExtractionSource != "agent_hook" {
		t.Errorf("expected extraction_source 'agent_hook', got '%s'", added1[0].ExtractionSource)
	}
	if added1[0].SourceSessionID == nil || *added1[0].SourceSessionID != sessionID {
		t.Errorf("expected source_session_id to match sessionID")
	}

	// 2. Test extraction of Brand Truth (品牌事实层)
	sessionID2 := uuid.New()
	userPromptFact := "官方资质认证为全国甲级家政认证，透明计价按建筑面积收费"
	added2 := uc.TriggerPostSessionMemoryHookSync(ctx, sessionID2, projID, userPromptFact, "已确认品牌事实基准。", nil)
	if len(added2) == 0 {
		t.Fatalf("expected memory items extracted from fact prompt, got 0")
	}
	if added2[0].MemoryType != "brand_truth" {
		t.Errorf("expected memory_type 'brand_truth', got '%s'", added2[0].MemoryType)
	}

	// 3. Test extraction of Episodic Strategy (历史策略与经验层)
	sessionID3 := uuid.New()
	toolCalls := []OpenAIToolCall{
		{
			Function: OpenAIFunctionCall{
				Name:      "generate_optimized_content",
				Arguments: `{"opportunity_id": "opp-123"}`,
			},
		},
	}
	added3 := uc.TriggerPostSessionMemoryHookSync(ctx, sessionID3, projID, "生成优化内容草稿", "已生成草稿", toolCalls)
	if len(added3) == 0 {
		t.Fatalf("expected memory items extracted from tool execution, got 0")
	}
	if added3[0].MemoryType != "episodic_strategy" {
		t.Errorf("expected memory_type 'episodic_strategy', got '%s'", added3[0].MemoryType)
	}

	// 4. Verify all 3 tiers are present and assembled in BuildMemoryContext
	allEntries, err := harnessRepo.ListMemoryEntries(ctx, projID, "")
	if err != nil || len(allEntries) < 3 {
		t.Fatalf("expected at least 3 entries in memory, got %d, err: %v", len(allEntries), err)
	}

	memContext := harnessRepo.BuildMemoryContext(ctx, projID)
	if strings.Contains(memContext, added1[0].Content) || strings.Contains(memContext, added2[0].Content) || strings.Contains(memContext, added3[0].Content) {
		t.Fatal("pending memories injected as trusted context")
	}
	for _, entry := range allEntries {
		if entry.Status != "pending" {
			t.Fatal("extracted memory must await approval")
		}
	}

	// 5. Verify deduplication: triggering again with the same prompt does not duplicate
	dupAdded := uc.TriggerPostSessionMemoryHookSync(ctx, sessionID, projID, userPromptPref, "好的，我已记录您的偏好。", nil)
	if len(dupAdded) > 0 {
		t.Errorf("expected 0 new entries on duplicate prompt, got %d", len(dupAdded))
	}
}
