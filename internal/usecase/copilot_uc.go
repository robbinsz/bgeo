package usecase

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/robbinsz/bgeo/internal/config"
	"github.com/robbinsz/bgeo/internal/domain"
	"github.com/robbinsz/bgeo/pkg/outbound"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/robbinsz/bgeo/internal/delivery/ws"
	"github.com/robbinsz/bgeo/internal/repository"
	"github.com/smallnest/langgraphgo/graph"
)

// CopilotState represents the state passed between nodes in the LangGraph StateGraph
type CopilotState struct {
	SessionID       uuid.UUID             `json:"session_id"`
	ProjectID       uuid.UUID             `json:"project_id"`
	UserID          uuid.UUID             `json:"user_id"`
	UserMessage     string                `json:"user_message"`
	CurrentRoute    string                `json:"current_route"`
	SelectedOppID   string                `json:"selected_opp_id"`
	Messages        []OpenAIMessage       `json:"messages"`
	PendingAction   *CopilotActionPreview `json:"pending_action,omitempty"`
	ActionConfirmed bool                  `json:"action_confirmed"`
	ActionCancelled bool                  `json:"action_cancelled"`
	FinalResponse   string                `json:"final_response"`
	ExecutedTools   []string              `json:"executed_tools"`
	IsInterrupted   bool                  `json:"is_interrupted"`
	InterruptID     string                `json:"interrupt_id,omitempty"`
}

type CopilotActionPreview struct {
	ProjectRevision string                 `json:"project_revision"`
	ToolSchemaHash  string                 `json:"tool_schema_hash"`
	ContentVersion  int                    `json:"content_version"`
	ContentHash     string                 `json:"content_hash"`
	ServerUpdatedAt time.Time              `json:"server_updated_at"`
	InterruptID     string                 `json:"interrupt_id"`
	CardType        string                 `json:"card_type"` // preview_schedule, preview_publish
	Title           string                 `json:"title"`
	Description     string                 `json:"description"`
	Details         map[string]interface{} `json:"details"`
	ToolName        string                 `json:"tool_name"`
	ToolArgs        string                 `json:"tool_args"`
}

type OpenAIMessage struct {
	Role       string           `json:"role"`
	Content    string           `json:"content"`
	ToolCalls  []OpenAIToolCall `json:"tool_calls,omitempty"`
	ToolCallID string           `json:"tool_call_id,omitempty"`
}

type OpenAIToolCall struct {
	ID       string             `json:"id"`
	Type     string             `json:"type"`
	Function OpenAIFunctionCall `json:"function"`
}

type OpenAIFunctionCall struct {
	Name      string `json:"name"`
	Arguments string `json:"arguments"`
}

// ExecutionStep represents a single discrete phase/event in an Agent execution lifecycle
type ExecutionStep struct {
	StepID      string                 `json:"step_id"`
	StepType    string                 `json:"step_type"` // memory_retrieval, skill_assembly, model_inference, tool_execution, post_session_hook, user_approval
	Title       string                 `json:"title"`
	Description string                 `json:"description"`
	DurationMs  int64                  `json:"duration_ms"`
	Timestamp   time.Time              `json:"timestamp"`
	Status      string                 `json:"status"` // success, pending, failed, fallback
	Details     map[string]interface{} `json:"details,omitempty"`
}

type CopilotUsecase struct {
	copilotRepo *repository.CopilotRepository
	harnessRepo *repository.HarnessRepository
	monitorUC   *MonitorUsecase
	contentUC   *ContentUsecase
	monitorRepo *repository.MonitorRepository
	oppRepo     *repository.OpportunityRepository
	projectRepo *repository.ProjectRepository
	contentRepo *repository.ContentRepository
	hub         *ws.Hub
}

func NewCopilotUsecase(
	copilotRepo *repository.CopilotRepository,
	harnessRepo *repository.HarnessRepository,
	monitorUC *MonitorUsecase,
	contentUC *ContentUsecase,
	mRepo *repository.MonitorRepository,
	oRepo *repository.OpportunityRepository,
	pRepo *repository.ProjectRepository,
	cRepo *repository.ContentRepository,
	hub *ws.Hub,
) *CopilotUsecase {
	return &CopilotUsecase{
		copilotRepo: copilotRepo,
		harnessRepo: harnessRepo,
		monitorUC:   monitorUC,
		contentUC:   contentUC,
		monitorRepo: mRepo,
		oppRepo:     oRepo,
		projectRepo: pRepo,
		contentRepo: cRepo,
		hub:         hub,
	}
}

// Tool Definitions following OpenAI Function Calling Schema
func (uc *CopilotUsecase) getToolDefinitions() []map[string]interface{} {
	return []map[string]interface{}{
		{
			"type": "function",
			"function": map[string]interface{}{
				"name":        "get_geo_overview_and_gaps",
				"description": "查看当前项目的 GEO 核心效果概览，包括品牌提及率、推荐率、竞品落后差距以及首要落后机会列表。",
				"parameters": map[string]interface{}{
					"type": "object",
					"properties": map[string]interface{}{
						"limit": map[string]interface{}{
							"type":        "integer",
							"description": "返回落后机会的最大条数，默认为 5",
						},
					},
				},
			},
		},
		{
			"type": "function",
			"function": map[string]interface{}{
				"name":        "run_monitor_batch",
				"description": "立即在后台触发一轮全量关键词的多渠道监测拨测（直接执行，通过进度事件反馈）。",
				"parameters": map[string]interface{}{
					"type": "object",
					"properties": map[string]interface{}{
						"reason": map[string]interface{}{
							"type":        "string",
							"description": "触发本轮拨测的业务原因，例如常规复测或竞品波动复核",
						},
					},
				},
			},
		},
		{
			"type": "function",
			"function": map[string]interface{}{
				"name":        "get_schedule_status",
				"description": "查询当前项目的自动化监测定时任务调度状态，包括计划运行频率、最近拨测历史及成功率。",
				"parameters": map[string]interface{}{
					"type":       "object",
					"properties": map[string]interface{}{},
				},
			},
		},
		{
			"type": "function",
			"function": map[string]interface{}{
				"name":        "update_schedule_config",
				"description": "【高风险操作】修改自动化监测或复测的定时调度规则（如调整执行频率、时间点）。此操作会生成确认卡片等待人工审批。",
				"parameters": map[string]interface{}{
					"type": "object",
					"properties": map[string]interface{}{
						"frequency": map[string]interface{}{
							"type":        "string",
							"enum":        []string{"hourly", "daily", "weekly"},
							"description": "拨测调度频次",
						},
						"time_slot": map[string]interface{}{
							"type":        "string",
							"description": "每日执行的具体时间点，例如 '09:00' 或 '20:00'",
						},
						"reason": map[string]interface{}{
							"type":        "string",
							"description": "调整调度的原因",
						},
					},
					"required": []string{"frequency"},
				},
			},
		},
		{
			"type": "function",
			"function": map[string]interface{}{
				"name":        "generate_optimized_content",
				"description": "基于指定的 GEO 机会和企业品牌事实库，自动生成用于提升 AI 问答推荐率的优化内容草稿。",
				"parameters": map[string]interface{}{
					"type": "object",
					"properties": map[string]interface{}{
						"opportunity_id": map[string]interface{}{
							"type":        "string",
							"description": "目标机会的 UUID，如果用户在对应机会页面可从上下文传入",
						},
						"theme": map[string]interface{}{
							"type":        "string",
							"description": "内容重点方向，如价格透明度、资质对比、服务保障等",
						},
					},
				},
			},
		},
		{
			"type": "function",
			"function": map[string]interface{}{
				"name":        "publish_content_to_channel",
				"description": "【高风险操作】将已生成的优化内容正式分发并发布到指定外部渠道。必须生成预览卡片经人工最终确认。",
				"parameters": map[string]interface{}{
					"type": "object",
					"properties": map[string]interface{}{
						"content_id": map[string]interface{}{
							"type":        "string",
							"description": "内容资产的 UUID",
						},
						"channel": map[string]interface{}{
							"type":        "string",
							"description": "目标发布渠道，如官网动态、知乎、微信公众号、小红书等",
						},
						"title": map[string]interface{}{
							"type":        "string",
							"description": "发布内容的标题",
						},
					},
					"required": []string{"content_id", "channel", "title"},
				},
			},
		},
	}
}

// skillToTools maps skill ID -> tool name prefixes/names it provides.
// Used to filter the tool list based on which skills are enabled in the Harness.
var skillToTools = map[string][]string{
	"monitor":   {"get_geo_overview_and_gaps", "run_monitor_batch", "get_schedule_status", "update_schedule_config"},
	"publish":   {"update_schedule_config", "publish_content_to_channel"},
	"content":   {"generate_optimized_content"},
	"diagnosis": {"get_geo_overview_and_gaps"},
	"evolution": {},
}

// getFilteredTools returns the subset of built-in tool definitions that are
// covered by the currently enabled skills. If enabledSkills is empty, all tools are returned.
func (uc *CopilotUsecase) getFilteredTools(enabledSkills []string) []map[string]interface{} {
	if len(enabledSkills) == 0 {
		return nil
	}
	// Build allowed tool name set
	allowed := make(map[string]struct{})
	for _, skill := range enabledSkills {
		if names, ok := skillToTools[skill]; ok {
			for _, n := range names {
				allowed[n] = struct{}{}
			}
		}
	}
	if len(allowed) == 0 {
		return nil
	}
	var result []map[string]interface{}
	for _, def := range uc.getToolDefinitions() {
		fn, _ := def["function"].(map[string]interface{})
		if fn == nil {
			continue
		}
		name, _ := fn["name"].(string)
		if _, ok := allowed[name]; ok {
			result = append(result, def)
		}
	}
	return result
}

// BuildStateGraph constructs the compiled LangGraph workflow
func (uc *CopilotUsecase) BuildStateGraph() (*graph.StateRunnable[CopilotState], error) {
	g := graph.NewStateGraph[CopilotState]()

	// 1. Agent decision node
	g.AddNode("agent", "Agent Decision", func(ctx context.Context, state CopilotState) (CopilotState, error) {
		if state.PendingAction != nil {
			_, _, _, err := uc.findTool(ctx, state.ProjectID, state.PendingAction.ToolName)
			if err != nil {
				return state, err
			}
		}
		return state, nil
	})

	// 2. Safe tools execution node
	g.AddNode("execute_safe_tool", "Execute Safe Tools", func(ctx context.Context, state CopilotState) (CopilotState, error) {
		result, err := uc.executeTool(ctx, state.ProjectID, state.PendingAction.ToolName, state.PendingAction.ToolArgs)
		state.FinalResponse = result.Summary
		if err == nil {
			state.ExecutedTools = append(state.ExecutedTools, state.PendingAction.ToolName)
		}
		return state, err
	})

	// 3. High-risk interrupt node
	g.AddNode("interrupt_guard", "High-Risk Interrupt Guard", func(ctx context.Context, state CopilotState) (CopilotState, error) {
		if state.PendingAction != nil && !state.ActionConfirmed {
			state.IsInterrupted = true
		}
		return state, nil
	})

	g.SetEntryPoint("agent")
	g.AddConditionalEdge("agent", func(ctx context.Context, state CopilotState) string {
		if state.PendingAction != nil {
			if requiresApproval(state.PendingAction.ToolName) {
				return "interrupt_guard"
			}
			return "execute_safe_tool"
		}
		return graph.END
	})

	g.AddEdge("execute_safe_tool", graph.END)
	g.AddEdge("interrupt_guard", graph.END)

	return g.Compile()
}

// ChatStream handles end-to-end conversation with LangGraph coordination and SSE output
func isDemo() bool { return config.Demo() }

func (uc *CopilotUsecase) ChatStream(ctx context.Context, sessionID, projectID, userID uuid.UUID, prompt string, contextMap map[string]interface{}, writer io.Writer, flusher http.Flusher) error {
	start := time.Now()
	actor := domain.ActorFrom(ctx)
	if actor.ProjectID != projectID || actor.UserID != userID || userID == uuid.Nil {
		return domain.ErrForbidden
	}
	if len(prompt) == 0 || len(prompt) > 16000 {
		return domain.ErrInvalid
	}
	session, err := uc.copilotRepo.GetSession(ctx, sessionID)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		// An existing session owned by another user must never be recreated.
		var count int64
		if err = uc.copilotRepo.DB().Model(&repository.CopilotSessionModel{}).Where("id = ?", sessionID).Count(&count).Error; err != nil {
			return err
		}
		if count != 0 {
			return domain.ErrForbidden
		}
		session = &repository.CopilotSessionModel{BaseGormModel: repository.BaseGormModel{ID: sessionID}, ProjectID: projectID, UserID: userID, Title: summarizeTitle(prompt)}
		if err = uc.copilotRepo.CreateSession(ctx, session); err != nil {
			return err
		}
	} else if err != nil {
		return err
	}
	if err = uc.copilotRepo.SaveMessage(ctx, &repository.CopilotMessageModel{SessionID: sessionID, Role: "user", Content: prompt}); err != nil {
		return err
	}
	project, err := uc.projectRepo.GetProject(ctx, projectID)
	if err != nil {
		return err
	}
	cfg, err := uc.copilotRepo.GetActiveAIConfig(ctx)
	if err != nil {
		return err
	}
	harness, err := uc.harnessRepo.GetOrCreateConfig(ctx, projectID)
	if err != nil {
		return err
	}
	var skills []string
	if err = json.Unmarshal([]byte(harness.EnabledSkills), &skills); err != nil {
		return err
	}
	definitions := uc.getFilteredTools(skills)
	servers, err := uc.harnessRepo.ListMCPServers(ctx, projectID)
	if err != nil {
		return err
	}
	for _, server := range servers {
		if !server.IsActive {
			continue
		}
		client, e := mcpForServer(server)
		if e != nil {
			return e
		}
		tools, e := client.ListTools(ctx)
		if e != nil {
			sendSSE(writer, flusher, "tool_error", map[string]string{"error": "外部工具服务不可用", "server_id": server.ID.String()})
			continue
		}
		for _, tool := range tools {
			tool.Name = toolNamespace(server.ID, tool.Name)
			definitions = append(definitions, tool.ToOpenAIToolDef())
		}
	}
	allowed := map[string]bool{}
	for _, definition := range definitions {
		allowed[definition["function"].(map[string]interface{})["name"].(string)] = true
	}
	facts, err := uc.projectRepo.ListBrandFacts(ctx, projectID)
	if err != nil {
		return err
	}
	system := fmt.Sprintf("你是运营副驾驶。项目品牌：%s。只根据已批准事实和工具返回结果作答。工具受理任务不代表执行成功。发布和外部工具需要审批。禁止声称未执行的操作成功。已批准事实：", project.BrandName)
	for _, fact := range facts {
		system += "\n" + fact.Statement + " 来源：" + fact.Source
	}
	system += uc.harnessRepo.BuildMemoryContext(ctx, projectID) + uc.harnessRepo.BuildCustomSkillsPrompt(ctx, projectID)
	if len(system) > 64000 {
		return fmt.Errorf("%w: context exceeds configured boundary", domain.ErrInvalid)
	}
	history, err := uc.copilotRepo.ListMessages(ctx, sessionID)
	if err != nil {
		return err
	}
	messages := []OpenAIMessage{{Role: "system", Content: system}}
	limit := harness.MaxHistoryTurns * 2
	if limit < 2 {
		limit = 2
	}
	if limit > 80 {
		limit = 80
	}
	idx := len(history) - limit
	if idx < 0 {
		idx = 0
	}
	for _, message := range history[idx:] {
		messages = append(messages, OpenAIMessage{Role: message.Role, Content: message.Content})
	}
	response, calls, err := uc.callLLM(ctx, cfg, messages, definitions)
	modelStatus := "success"
	if err != nil {
		if !isDemo() {
			sendSSE(writer, flusher, "error", map[string]string{"error": "模型请求失败；未执行任何工具"})
			return err
		}
		response, calls = uc.fallbackSimulation(prompt, contextMap, project.BrandName)
		modelStatus = "demo"
	}
	if len(calls) > 0 {
		response = ""
	}
	if len(calls) > 8 {
		return fmt.Errorf("%w: too many tool calls", domain.ErrInvalid)
	}
	steps := []ExecutionStep{{StepID: uuid.NewString(), StepType: "memory_retrieval", Title: "已批准上下文检索", Status: "success", Timestamp: time.Now()}, {StepID: uuid.NewString(), StepType: "skill_assembly", Title: "服务端技能装配", Status: "success", Timestamp: time.Now()}, {StepID: uuid.NewString(), StepType: "model_inference", Title: "模型推理", Status: modelStatus, Timestamp: time.Now()}}
	cardType, cardPayload, cardStatus := "", "", ""
	overall := "completed"
	compiled, err := uc.BuildStateGraph()
	if err != nil {
		return err
	}
	toolResponses := []OpenAIMessage{}
	for _, call := range calls {
		name, args := call.Function.Name, call.Function.Arguments
		var toolErr error
		summary := ""
		if !allowed[name] {
			toolErr = domain.ErrForbidden
		} else if requiresApproval(name) {
			preview, e := uc.preparePreview(ctx, projectID, name, args)
			toolErr = e
			if e == nil {
				state := CopilotState{SessionID: sessionID, ProjectID: projectID, UserID: userID, PendingAction: preview, InterruptID: preview.InterruptID}
				state, e = compiled.Invoke(ctx, state)
				toolErr = e
				if e == nil {
					raw, _ := json.Marshal(state)
					e = uc.copilotRepo.SaveCheckpoint(ctx, &repository.CopilotCheckpointModel{SessionID: sessionID, ThreadID: sessionID.String(), StateData: string(raw), InterruptID: preview.InterruptID})
					toolErr = e
				}
				if e == nil {
					raw, _ := json.Marshal(preview)
					cardType, cardPayload, cardStatus = preview.CardType, string(raw), "pending"
					overall = "interrupted"
					summary = "已生成审批卡片，等待确认。"
					sendSSE(writer, flusher, "interrupt", preview)
				}
			}
		} else {
			state, e := compiled.Invoke(ctx, CopilotState{SessionID: sessionID, ProjectID: projectID, UserID: userID, PendingAction: &CopilotActionPreview{ToolName: name, ToolArgs: args}})
			toolErr = e
			summary = state.FinalResponse
		}
		status := "success"
		if cardStatus == "pending" {
			status = "pending_confirmation"
		}
		if toolErr != nil {
			status = "failed"
			overall = "failed"
			summary = "执行失败：" + toolErr.Error()
		}
		if err = uc.copilotRepo.RecordAuditLog(ctx, &repository.CopilotAuditLogModel{ProjectID: projectID, UserID: userID, SessionID: sessionID, ToolName: name, InputPayload: redactJSON(args), ExecutionStatus: status, ExecutionRisk: map[bool]string{true: "confirmed", false: "direct"}[requiresApproval(name)]}); err != nil {
			return err
		}
		steps = append(steps, ExecutionStep{StepID: uuid.NewString(), StepType: "tool_execution", Title: name, Status: status, Description: summary, Timestamp: time.Now()})
		toolResponses = append(toolResponses, OpenAIMessage{Role: "tool", ToolCallID: call.ID, Content: summary})
		response += "\n" + summary
		sendSSE(writer, flusher, "tool_done", map[string]interface{}{"tool": name, "result": summary, "status": status})
		// One outstanding approval per session; remaining calls must be proposed in a new turn.
		if cardStatus == "pending" {
			break
		}
	}
	if len(toolResponses) == len(calls) && len(calls) > 0 && cardStatus == "" && !isDemo() {
		followup := append(messages, OpenAIMessage{Role: "assistant", Content: "", ToolCalls: calls})
		followup = append(followup, toolResponses...)
		if text, _, e := uc.callLLM(ctx, cfg, followup, nil); e == nil && text != "" {
			response = text
		}
	}
	sendSSE(writer, flusher, "message_chunk", map[string]string{"chunk": response})
	traceID := uuid.New()
	timeline, _ := json.Marshal(steps)
	if err = uc.copilotRepo.SaveExecutionTrace(ctx, &repository.AgentExecutionTraceModel{BaseGormModel: repository.BaseGormModel{ID: traceID}, ProjectID: projectID, SessionID: sessionID, UserPrompt: prompt, ModelName: cfg.ModelName, TotalDurationMs: time.Since(start).Milliseconds(), Status: overall, TimelineJSON: string(timeline)}); err != nil {
		return err
	}
	callJSON, _ := json.Marshal(calls)
	if err = uc.copilotRepo.SaveMessage(ctx, &repository.CopilotMessageModel{SessionID: sessionID, Role: "assistant", Content: response, ToolCalls: string(callJSON), CardType: cardType, CardPayload: cardPayload, CardStatus: cardStatus, TraceID: &traceID}); err != nil {
		return err
	}
	if err = uc.copilotRepo.UpdateSessionActivity(ctx, sessionID, ""); err != nil {
		return err
	}
	if overall == "completed" {
		raw, _ := json.Marshal(memoryHookPayload{SessionID: sessionID, UserPrompt: prompt, AssistantResp: response, ToolCalls: calls})
		if err = repository.EnqueueJob(uc.copilotRepo.DB().WithContext(ctx), &repository.JobModel{ProjectID: projectID, Kind: "memory_hook", Payload: string(raw), IdempotencyKey: "memory:" + traceID.String()}); err != nil {
			return err
		}
	}
	sendSSE(writer, flusher, "done", map[string]interface{}{"session_id": sessionID, "title": session.Title, "trace_id": traceID, "status": overall})
	return nil
}

func (uc *CopilotUsecase) ResumeAction(ctx context.Context, sessionID, projectID, userID uuid.UUID, interruptID, action string, writer io.Writer, flusher http.Flusher) error {
	jobID, err := uc.QueueApprovedAction(ctx, sessionID, projectID, userID, interruptID, action)
	if err != nil {
		return err
	}
	status := "queued"
	if action == "cancel" {
		status = "cancelled"
	}
	sendSSE(writer, flusher, "action_result", map[string]interface{}{"status": status, "job_id": jobID, "summary": "审批已记录，执行结果请查看任务状态。"})
	sendSSE(writer, flusher, "done", map[string]interface{}{"session_id": sessionID, "status": status, "job_id": jobID})
	return nil
}

func (uc *CopilotUsecase) callLLM(
	ctx context.Context,
	cfg *repository.AIConfigModel,
	messages []OpenAIMessage,
	tools []map[string]interface{},
) (string, []OpenAIToolCall, error) {
	if cfg == nil || cfg.APIKey == "" {
		return "", nil, fmt.Errorf("AI 配置中缺少 API 密钥")
	}

	baseURL := strings.TrimRight(cfg.BaseURL, "/")
	url := baseURL + "/chat/completions"

	reqBody := map[string]interface{}{
		"model":       cfg.ModelName,
		"messages":    messages,
		"temperature": cfg.Temperature,
		"max_tokens":  2048,
	}

	if len(tools) > 0 {
		reqBody["tools"] = tools
		reqBody["tool_choice"] = "auto"
	}
	bodyBytes, err := json.Marshal(reqBody)
	if err != nil {
		return "", nil, err
	}

	if len(bodyBytes) > 128<<10 {
		return "", nil, fmt.Errorf("%w: model request context exceeds 128KB", domain.ErrInvalid)
	}
	requestID, err := uc.reserveModelCall(ctx, cfg.ModelName)
	if err != nil {
		return "", nil, err
	}
	status := "outcome_unknown"
	var tokens *int
	defer func() {
		persistCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := uc.copilotRepo.DB().WithContext(persistCtx).Model(&repository.ModelCallModel{}).Where("id = ?", requestID).Updates(map[string]interface{}{"status": status, "tokens_used": tokens}).Error; err != nil {
			slog.Error("model call outcome persistence failed", "request_id", requestID, "status", status)
		}
	}()
	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(bodyBytes))
	if err != nil {
		return "", nil, err
	}
	req.Header.Set("Authorization", "Bearer "+cfg.APIKey)
	req.Header.Set("Content-Type", "application/json")

	if err := outbound.ValidateURL(url); err != nil {
		return "", nil, err
	}
	client := outbound.Client(60 * time.Second)
	resp, err := client.Do(req)
	if err != nil {
		return "", nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		status = "failed"
		return "", nil, fmt.Errorf("大模型接口返回异常 HTTP %d", resp.StatusCode)
	}

	var parsed struct {
		Usage struct {
			TotalTokens *int `json:"total_tokens"`
		} `json:"usage"`
		Choices []struct {
			Message struct {
				Content   string           `json:"content"`
				ToolCalls []OpenAIToolCall `json:"tool_calls"`
			} `json:"message"`
		} `json:"choices"`
	}

	if err := json.NewDecoder(io.LimitReader(resp.Body, 4<<20)).Decode(&parsed); err != nil || len(parsed.Choices) == 0 {
		return "", nil, fmt.Errorf("解析模型返回失败")
	}

	status = "completed"
	tokens = parsed.Usage.TotalTokens
	msg := parsed.Choices[0].Message
	return msg.Content, msg.ToolCalls, nil
}

// fallbackSimulation provides robust intelligent matching when external API key is unset
func (uc *CopilotUsecase) fallbackSimulation(prompt string, contextMap map[string]interface{}, brandName string) (string, []OpenAIToolCall) {
	p := strings.ToLower(prompt)

	// 1. High risk: publish content to channel
	if strings.Contains(p, "发布") {
		return "发布内容涉及外部渠道传播与品牌合规。我已为你整理待发布内容并生成【发布审批卡片】，请仔细核对发布渠道与标题后点击确认。", []OpenAIToolCall{
			{
				ID:   "call_publish_content",
				Type: "function",
				Function: OpenAIFunctionCall{
					Name:      "publish_content_to_channel",
					Arguments: fmt.Sprintf(`{"channel": "官网动态与问答库", "title": "为什么选择 %s？透明收费标准与售后责任险详解"}`, brandName),
				},
			},
		}
	}

	// 2. High risk: update schedule config
	if (strings.Contains(p, "改") || strings.Contains(p, "设置") || strings.Contains(p, "更新") || strings.Contains(p, "调整")) &&
		(strings.Contains(p, "定时") || strings.Contains(p, "调度") || strings.Contains(p, "时间") || strings.Contains(p, "频次")) {
		timeSlot := "09:00"
		if strings.Contains(p, "点") || strings.Contains(p, ":") {
			timeSlot = "09:00"
		}
		return "检测到你希望调整自动化监测任务的调度频次。由于涉及系统定时触发机制，我已生成变更确认卡片供你核验。", []OpenAIToolCall{
			{
				ID:   "call_update_schedule",
				Type: "function",
				Function: OpenAIFunctionCall{
					Name:      "update_schedule_config",
					Arguments: fmt.Sprintf(`{"frequency": "daily", "time_slot": "%s", "reason": "根据运营节奏优化拨测时间"}`, timeSlot),
				},
			},
		}
	}

	// 3. Inspect schedule status
	if strings.Contains(p, "定时") || strings.Contains(p, "调度") || strings.Contains(p, "cron") || strings.Contains(p, "计划") {
		return "正在查看当前项目的定时任务配置与执行健康状态...", []OpenAIToolCall{
			{
				ID:   "call_get_schedule",
				Type: "function",
				Function: OpenAIFunctionCall{
					Name:      "get_schedule_status",
					Arguments: `{}`,
				},
			},
		}
	}

	// 4. Generate optimized content
	if strings.Contains(p, "写") || strings.Contains(p, "生成") || strings.Contains(p, "优化") || strings.Contains(p, "草稿") {
		oppID := ""
		if contextMap != nil {
			if id, ok := contextMap["selected_opportunity_id"].(string); ok {
				oppID = id
			}
		}
		return fmt.Sprintf("正在基于 %s 品牌事实库与核心优势，为该落后机会量身生成回答优化草稿...", brandName), []OpenAIToolCall{
			{
				ID:   "call_generate_content",
				Type: "function",
				Function: OpenAIFunctionCall{
					Name:      "generate_optimized_content",
					Arguments: fmt.Sprintf(`{"opportunity_id": "%s", "theme": "权威凭证与透明计价证明"}`, oppID),
				},
			},
		}
	}

	// 5. Trigger monitor batch run
	if strings.Contains(p, "拨测") || strings.Contains(p, "监测") ||
		(strings.Contains(p, "跑") || strings.Contains(p, "执行") || strings.Contains(p, "触发") || strings.Contains(p, "立即")) {
		return fmt.Sprintf("收到！我将立即为你触发一轮全量高价值关键词的 GEO 拨测采集，监测 %s 在主要 AI 问答平台中的最新提及与排名情况。", brandName), []OpenAIToolCall{
			{
				ID:   "call_batch_run",
				Type: "function",
				Function: OpenAIFunctionCall{
					Name:      "run_monitor_batch",
					Arguments: `{"reason": "用户指令即时全量拨测"}`,
				},
			},
		}
	}

	// 6. View overview & gaps
	if strings.Contains(p, "效果") || strings.Contains(p, "排名") || strings.Contains(p, "差距") || strings.Contains(p, "诊断") || strings.Contains(p, "机会") || strings.Contains(p, "看板") {
		return fmt.Sprintf("正在为你检索 %s 当前的 GEO 整体诊断数据与竞品落后指标...", brandName), []OpenAIToolCall{
			{
				ID:   "call_geo_overview",
				Type: "function",
				Function: OpenAIFunctionCall{
					Name:      "get_geo_overview_and_gaps",
					Arguments: `{"limit": 5}`,
				},
			},
		}
	}

	if strings.Contains(p, "写") || strings.Contains(p, "生成") || strings.Contains(p, "内容") || strings.Contains(p, "优化") || strings.Contains(p, "草稿") {
		oppID := ""
		if contextMap != nil {
			if id, ok := contextMap["selected_opportunity_id"].(string); ok {
				oppID = id
			}
		}
		return fmt.Sprintf("正在基于 %s 品牌事实库与核心优势，为该落后机会量身生成回答优化草稿...", brandName), []OpenAIToolCall{
			{
				ID:   "call_generate_content",
				Type: "function",
				Function: OpenAIFunctionCall{
					Name:      "generate_optimized_content",
					Arguments: fmt.Sprintf(`{"opportunity_id": "%s", "theme": "权威凭证与透明计价证明"}`, oppID),
				},
			},
		}
	}

	return fmt.Sprintf("你好！我是 %s 的 GEO 智能运营副驾驶。\n你可以对我说：\n- “查看当前的 GEO 效果与竞品差距”\n- “立即跑一次全量监测拨测”\n- “针对当前机会生成一篇优化草稿”\n- “查看定时任务运行状态”\n- “把每日定时拨测改成早上 9 点跑”\n- “发布一条关于透明收费的答复内容”", brandName), nil
}

func summarizeTitle(prompt string) string {
	runes := []rune(prompt)
	if len(runes) > 18 {
		return string(runes[:18]) + "..."
	}
	return prompt
}

func sendSSE(w io.Writer, f http.Flusher, event string, data interface{}) {
	dataBytes, _ := json.Marshal(data)
	_, _ = fmt.Fprintf(w, "event: %s\ndata: %s\n\n", event, string(dataBytes))
	if f != nil {
		f.Flush()
	}
}

func (uc *CopilotUsecase) CallLLMDirect(ctx context.Context, cfg *repository.AIConfigModel, messages []OpenAIMessage) (string, []OpenAIToolCall, error) {
	return uc.callLLM(ctx, cfg, messages, nil)
}

// ─── Post-Session Memory Hook ───────────────────────────────────────────────

// ExtractedMemoryItem represents candidate memory distilled by the Post-Session Hook
type ExtractedMemoryItem struct {
	MemoryType  string  `json:"memory_type"` // brand_truth | user_pref | episodic_strategy
	Title       string  `json:"title"`
	Content     string  `json:"content"`
	Tags        string  `json:"tags"`
	ScoreWeight float64 `json:"score_weight"`
}

// TriggerPostSessionMemoryHook runs the post-session hook asynchronously to extract layered memories and experience
func (uc *CopilotUsecase) TriggerPostSessionMemoryHook(
	ctx context.Context,
	sessionID, projectID uuid.UUID,
	userPrompt, assistantResp string,
	toolCalls []OpenAIToolCall,
) {
	_ = uc.TriggerPostSessionMemoryHookSync(ctx, sessionID, projectID, userPrompt, assistantResp, toolCalls)
}

// TriggerPostSessionMemoryHookSync extracts and persists memory entries, returning what was added
type memoryHookPayload struct {
	SessionID     uuid.UUID        `json:"session_id"`
	UserPrompt    string           `json:"user_prompt"`
	AssistantResp string           `json:"assistant_resp"`
	ToolCalls     []OpenAIToolCall `json:"tool_calls"`
}

func (uc *CopilotUsecase) TriggerPostSessionMemoryHookSync(ctx context.Context, sessionID, projectID uuid.UUID, userPrompt, assistantResp string, toolCalls []OpenAIToolCall) []repository.MemoryEntryModel {
	entries, _ := uc.extractMemory(ctx, sessionID, projectID, userPrompt, assistantResp, toolCalls, nil)
	return entries
}
func (uc *CopilotUsecase) HandleMemoryJob(ctx context.Context, job repository.JobModel, payload memoryHookPayload) error {
	_, err := uc.extractMemory(ctx, payload.SessionID, job.ProjectID, payload.UserPrompt, payload.AssistantResp, payload.ToolCalls, &job)
	return err
}
func (uc *CopilotUsecase) extractMemory(ctx context.Context, sessionID, projectID uuid.UUID, prompt, response string, calls []OpenAIToolCall, job *repository.JobModel) ([]repository.MemoryEntryModel, error) {
	var candidates []ExtractedMemoryItem
	cfg, err := uc.copilotRepo.GetActiveAIConfig(ctx)
	if err != nil {
		return nil, err
	}
	if isDemo() && (cfg == nil || cfg.APIKey == "") {
		candidates = uc.heuristicExtractMemory(prompt, response, calls)
	} else {
		raw, _, err := uc.callLLM(ctx, cfg, []OpenAIMessage{{Role: "system", Content: `提取待人工核验的记忆候选。只提取用户明确表达的长期偏好或声明，禁止把助手建议和未完成任务当成事实。无信息返回 []。输出 JSON 数组 [{"memory_type":"user_pref|brand_truth|episodic_strategy","title":"标题","content":"用户原始声明","tags":"","score_weight":1}]。`}, {Role: "user", Content: prompt + "\n助手答复（不作为事实依据）：" + response}}, nil)
		if err != nil {
			return nil, err
		}
		if err = json.Unmarshal([]byte(raw), &candidates); err != nil {
			return nil, err
		}
	}
	if len(candidates) > 20 {
		return nil, domain.ErrInvalid
	}
	entries := []repository.MemoryEntryModel{}
	err = uc.harnessRepo.DB().WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if job != nil {
			if err := verifyLease(tx, *job); err != nil {
				return err
			}
		}
		// Serialize candidates per project to make retries idempotent without overwriting approved memory.
		var project repository.ProjectModel
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("id = ?", projectID).First(&project).Error; err != nil {
			return err
		}
		for _, candidate := range candidates {
			if candidate.Title == "" || candidate.Content == "" || len(candidate.Title) > 240 || len(candidate.Content) > 4000 {
				continue
			}
			if candidate.MemoryType != "brand_truth" && candidate.MemoryType != "user_pref" && candidate.MemoryType != "episodic_strategy" {
				return domain.ErrInvalid
			}
			var count int64
			if err := tx.Model(&repository.MemoryEntryModel{}).Where("project_id = ? AND memory_type = ? AND content = ?", projectID, candidate.MemoryType, candidate.Content).Count(&count).Error; err != nil {
				return err
			}
			if count > 0 {
				continue
			}
			entry := repository.MemoryEntryModel{ProjectID: projectID, MemoryType: candidate.MemoryType, Title: candidate.Title, Content: candidate.Content, Tags: candidate.Tags, ScoreWeight: 1, SourceSessionID: &sessionID, ExtractionSource: "agent_hook", Status: "pending", Evidence: "session:" + sessionID.String()}
			if err := tx.Create(&entry).Error; err != nil {
				return err
			}
			entries = append(entries, entry)
		}
		return nil
	})
	if err == nil && len(entries) > 0 && uc.hub != nil {
		uc.hub.BroadcastProject(projectID, "memory:distilled", "harness", map[string]interface{}{"session_id": sessionID, "count": len(entries), "items": entries})
	}
	return entries, err
}

func (uc *CopilotUsecase) heuristicExtractMemory(userPrompt, assistantResp string, toolCalls []OpenAIToolCall) []ExtractedMemoryItem {
	var items []ExtractedMemoryItem

	// 1. Check for User Preference (运营偏好层)
	prefKeywords := []string{"以后", "记住", "偏好", "风格", "口吻", "语气", "不要", "必须", "侧重", "优先", "禁忌"}
	hasPref := false
	for _, kw := range prefKeywords {
		if strings.Contains(userPrompt, kw) {
			hasPref = true
			break
		}
	}
	if hasPref {
		title := "运营习惯与口吻偏好"
		if strings.Contains(userPrompt, "知乎") {
			title = "知乎渠道运营偏好"
		} else if strings.Contains(userPrompt, "官网") {
			title = "官网内容语气偏好"
		} else if strings.Contains(userPrompt, "竞品") || strings.Contains(userPrompt, "盯防") {
			title = "竞品监测重点偏好"
		}

		cleanContent := userPrompt
		cleanContent = strings.TrimPrefix(cleanContent, "请记住：")
		cleanContent = strings.TrimPrefix(cleanContent, "记住：")
		cleanContent = strings.TrimPrefix(cleanContent, "请记住")
		cleanContent = strings.TrimPrefix(cleanContent, "记住")

		items = append(items, ExtractedMemoryItem{
			MemoryType:  "user_pref",
			Title:       title,
			Content:     fmt.Sprintf("用户指令约定：%s", strings.TrimSpace(cleanContent)),
			Tags:        "运营偏好,指令约定,自进化沉淀",
			ScoreWeight: 1.2,
		})
	}

	// 2. Check for Brand Truth (品牌事实层)
	factKeywords := []string{"官方资质", "认证", "透明计价", "服务价格", "资质是", "价格是", "承诺", "主打优势", "事实是", "纠正"}
	hasFact := false
	for _, kw := range factKeywords {
		if strings.Contains(userPrompt, kw) || strings.Contains(assistantResp, kw) {
			hasFact = true
			break
		}
	}
	if hasFact && !hasPref {
		items = append(items, ExtractedMemoryItem{
			MemoryType:  "brand_truth",
			Title:       "企业关键事实与资质沉淀",
			Content:     fmt.Sprintf("会话明确事实基准：%s", summarizeTitle(userPrompt)),
			Tags:        "品牌事实,官方资质,基准沉淀",
			ScoreWeight: 1.5,
		})
	}

	// 3. Check for Episodic Strategy (历史策略与经验层)
	for _, tc := range toolCalls {
		switch tc.Function.Name {
		case "generate_optimized_content":
			items = append(items, ExtractedMemoryItem{
				MemoryType:  "episodic_strategy",
				Title:       "落后机会事实核验优化切片",
				Content:     "针对落后推荐机会，通过注入企业资质凭证与透明计价条款生成优化内容，有效指导外部渠道分发与复测。",
				Tags:        "落后机会,优化草稿,实战策略",
				ScoreWeight: 1.1,
			})
		case "update_schedule_config":
			items = append(items, ExtractedMemoryItem{
				MemoryType:  "episodic_strategy",
				Title:       "自动化拨测巡检策略调整",
				Content:     "系统自动化巡检调度已按运营需求调整触发周期，保障关键词覆盖率与监测时效性。",
				Tags:        "自动化巡检,调度策略,运营经验",
				ScoreWeight: 1.0,
			})
		case "publish_content_to_channel":
			items = append(items, ExtractedMemoryItem{
				MemoryType:  "episodic_strategy",
				Title:       "多渠道发布与48h复测闭环经验",
				Content:     "内容经安全审批后已同步分发至外部渠道，系统自动建立48小时后模型推荐率回测闭环。",
				Tags:        "渠道发布,复测闭环,实战策略",
				ScoreWeight: 1.3,
			})
		}
	}

	return items
}

func (uc *CopilotUsecase) ExtractMemoryCandidates(ctx context.Context, sessionID, projectID uuid.UUID, prompt, response string) ([]repository.MemoryEntryModel, error) {
	return uc.extractMemory(ctx, sessionID, projectID, prompt, response, nil, nil)
}

func (uc *CopilotUsecase) reserveModelCall(ctx context.Context, model string) (uuid.UUID, error) {
	id := uuid.New()
	projectID := domain.ActorFrom(ctx).ProjectID
	if projectID == uuid.Nil {
		return id, domain.ErrForbidden
	}
	err := uc.copilotRepo.DB().WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var project repository.ProjectModel
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("id = ?", projectID).First(&project).Error; err != nil {
			return err
		}
		var count int64
		if err := tx.Model(&repository.ModelCallModel{}).Where("project_id = ? AND created_at > ?", projectID, time.Now().Add(-24*time.Hour)).Count(&count).Error; err != nil {
			return err
		}
		if project.DailyModelCallLimit <= 0 || count >= int64(project.DailyModelCallLimit) {
			return fmt.Errorf("%w: daily model request budget exceeded", domain.ErrConflict)
		}
		return tx.Create(&repository.ModelCallModel{BaseGormModel: repository.BaseGormModel{ID: id}, ProjectID: projectID, Model: model, Status: "requesting", MaxOutputTokens: 2048}).Error
	})
	return id, err
}
