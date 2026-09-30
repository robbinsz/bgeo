package usecase

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/google/jsonschema-go/jsonschema"
	"github.com/google/uuid"
	"github.com/robbinsz/bgeo/internal/connector/publisher"
	"github.com/robbinsz/bgeo/internal/domain"
	"github.com/robbinsz/bgeo/internal/repository"
	"github.com/robbinsz/bgeo/pkg/secretutil"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"regexp"
	"strings"
	"time"
)

type ToolResult struct {
	Summary string      `json:"summary"`
	Data    interface{} `json:"data,omitempty"`
}
type scheduleArgs struct {
	Frequency string `json:"frequency"`
	TimeSlot  string `json:"time_slot"`
	Reason    string `json:"reason"`
}
type publishArgs struct {
	ContentID string `json:"content_id"`
	Channel   string `json:"channel"`
	Title     string `json:"title"`
}

func requiresApproval(name string) bool {
	return name == "update_schedule_config" || name == "publish_content_to_channel" || strings.HasPrefix(name, "mcp_")
}
func toolNamespace(id uuid.UUID, name string) string {
	safe := regexp.MustCompile("[^a-zA-Z0-9_-]").ReplaceAllString(name, "_")
	if len(safe) > 14 {
		safe = safe[:14]
	}
	return "mcp_" + strings.ReplaceAll(id.String(), "-", "") + "__" + safe + "_" + secretutil.Digest(name)[:10]
}

func validateToolArgs(schema map[string]interface{}, raw string) error {
	if len(raw) > 32<<10 {
		return fmt.Errorf("%w: tool arguments exceed limit", domain.ErrInvalid)
	}
	var args map[string]interface{}
	if err := json.Unmarshal([]byte(raw), &args); err != nil || args == nil {
		return fmt.Errorf("%w: tool arguments must be a JSON object", domain.ErrInvalid)
	}
	bytes, err := json.Marshal(schema)
	if err != nil {
		return err
	}
	var definition jsonschema.Schema
	if err = json.Unmarshal(bytes, &definition); err != nil {
		return err
	}
	resolved, err := definition.Resolve(nil)
	if err != nil {
		return err
	}
	if err = resolved.Validate(args); err != nil {
		return fmt.Errorf("%w: tool arguments do not match schema: %s", domain.ErrInvalid, err)
	}
	return nil
}

func (uc *CopilotUsecase) findTool(ctx context.Context, projectID uuid.UUID, name string) (map[string]interface{}, *repository.MCPServerModel, string, error) {
	cfg, err := uc.harnessRepo.GetOrCreateConfig(ctx, projectID)
	if err != nil {
		return nil, nil, "", err
	}
	var skills []string
	if err = json.Unmarshal([]byte(cfg.EnabledSkills), &skills); err != nil {
		return nil, nil, "", err
	}
	for _, definition := range uc.getFilteredTools(skills) {
		f := definition["function"].(map[string]interface{})
		if f["name"] == name {
			return f["parameters"].(map[string]interface{}), nil, "", nil
		}
	}
	if strings.HasPrefix(name, "mcp_") {
		servers, err := uc.harnessRepo.ListMCPServers(ctx, projectID)
		if err != nil {
			return nil, nil, "", err
		}
		for _, server := range servers {
			if !server.IsActive || !strings.HasPrefix(name, "mcp_"+strings.ReplaceAll(server.ID.String(), "-", "")+"__") {
				continue
			}
			remote := ""
			client, err := mcpForServer(server)
			if err != nil {
				return nil, nil, "", err
			}
			tools, err := client.ListTools(ctx)
			if err != nil {
				return nil, nil, "", err
			}
			for _, tool := range tools {
				if toolNamespace(server.ID, tool.Name) == name {
					remote = tool.Name
					return tool.InputSchema, &server, remote, nil
				}
			}
		}
	}
	return nil, nil, "", fmt.Errorf("%w: tool is unknown or disabled", domain.ErrForbidden)
}
func mcpForServer(server repository.MCPServerModel) (*MCPClient, error) {
	var headers map[string]string
	if server.AuthHeaders != "" {
		if err := json.Unmarshal([]byte(server.AuthHeaders), &headers); err != nil {
			return nil, err
		}
	}
	client := NewMCPClient(server.ID.String(), server.EndpointURL, headers)
	switch server.TransportType {
	case "http_sse", "streamable_http", "":
	case "sse":
		client.transportType = "sse"
	default:
		return nil, fmt.Errorf("%w: unsupported MCP transport", domain.ErrInvalid)
	}
	return client, nil
}

func (uc *CopilotUsecase) executeTool(ctx context.Context, projectID uuid.UUID, name, raw string) (ToolResult, error) {
	schema, server, remote, err := uc.findTool(ctx, projectID, name)
	if err != nil {
		return ToolResult{}, err
	}
	if err = validateToolArgs(schema, raw); err != nil {
		return ToolResult{}, err
	}
	actor := domain.ActorFrom(ctx)
	if name != "get_geo_overview_and_gaps" && name != "get_schedule_status" {
		if !domain.CanWrite(actor.Role) {
			return ToolResult{}, domain.ErrForbidden
		}
		var project repository.ProjectModel
		if err = uc.projectRepo.DB().WithContext(ctx).Where("id = ?", projectID).First(&project).Error; err != nil {
			return ToolResult{}, err
		}
		if project.IsPaused {
			return ToolResult{}, domain.ErrPaused
		}
	}
	if server != nil {
		if !domain.CanReview(actor.Role) {
			return ToolResult{}, domain.ErrForbidden
		}
		var args map[string]interface{}
		_ = json.Unmarshal([]byte(raw), &args)
		client, err := mcpForServer(*server)
		if err != nil {
			return ToolResult{}, err
		}
		result, err := client.CallTool(ctx, remote, args)
		return ToolResult{Summary: result}, err
	}
	switch name {
	case "get_geo_overview_and_gaps":
		metrics, err := uc.monitorUC.Metrics(ctx, projectID)
		if err != nil {
			return ToolResult{}, err
		}
		raw, _ := json.Marshal(metrics)
		return ToolResult{Summary: string(raw), Data: metrics}, nil
	case "get_schedule_status":
		var schedule repository.ScheduleModel
		err := uc.projectRepo.DB().WithContext(ctx).Where("project_id = ?", projectID).First(&schedule).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ToolResult{Summary: "尚未配置自动监测调度。"}, nil
		}
		if err != nil {
			return ToolResult{}, err
		}
		return ToolResult{Summary: fmt.Sprintf("调度：%s %s；下次执行：%s", schedule.Frequency, schedule.TimeSlot, schedule.NextRunAt.Format(time.RFC3339)), Data: schedule}, nil
	case "run_monitor_batch":
		run, err := uc.monitorUC.ExecuteBatchRun(ctx, projectID)
		if err != nil {
			return ToolResult{}, err
		}
		return ToolResult{Summary: fmt.Sprintf("监测批次 %s 已受理，等待 Worker 采样 %d 个问题。", run.ID, run.TotalQueries), Data: run}, nil
	case "generate_optimized_content":
		var args struct {
			OpportunityID string `json:"opportunity_id"`
			Theme         string `json:"theme"`
		}
		if err := json.Unmarshal([]byte(raw), &args); err != nil {
			return ToolResult{}, err
		}
		if _, err := uuid.Parse(args.OpportunityID); err != nil {
			return ToolResult{}, fmt.Errorf("%w: a valid opportunity_id is required", domain.ErrInvalid)
		}
		var opportunity repository.OpportunityModel
		if err := uc.projectRepo.DB().WithContext(ctx).Where("id = ? AND project_id = ?", args.OpportunityID, projectID).First(&opportunity).Error; err != nil {
			return ToolResult{}, err
		}
		facts, err := uc.projectRepo.ListBrandFacts(ctx, projectID)
		if err != nil {
			return ToolResult{}, err
		}
		if len(facts) == 0 {
			return ToolResult{}, fmt.Errorf("%w: approved brand facts are required", domain.ErrConflict)
		}
		factText := []string{}
		for _, fact := range facts {
			factText = append(factText, fact.Statement)
		}
		cfg, err := uc.copilotRepo.GetActiveAIConfig(ctx)
		if err != nil {
			return ToolResult{}, err
		}
		body, _, err := uc.callLLM(ctx, cfg, []OpenAIMessage{{Role: "system", Content: "根据已批准事实生成中文内容草稿。只使用给定事实，禁止新增价格、资质或承诺。事实基准：\n" + strings.Join(factText, "\n")}, {Role: "user", Content: "机会：" + opportunity.Title + "\n内容方向：" + args.Theme}}, nil)
		if err != nil {
			if !isDemo() {
				return ToolResult{}, err
			}
			body = strings.Join(factText, "\n")
		}
		asset, err := uc.contentUC.CreateContentAsset(ctx, projectID, opportunity.Title, "faq", body, map[string]interface{}{"opportunity_id": opportunity.ID.String(), "theme": args.Theme, "intent": "commercial"})
		if err != nil {
			return ToolResult{}, err
		}
		return ToolResult{Summary: fmt.Sprintf("草稿 %s 已保存，状态：%s；发布前需要事实核验及人工审批。", asset.ID, asset.Status), Data: asset}, nil
	case "update_schedule_config":
		var args scheduleArgs
		if err = json.Unmarshal([]byte(raw), &args); err != nil {
			return ToolResult{}, err
		}
		return uc.saveSchedule(ctx, projectID, args)
	case "publish_content_to_channel":
		return ToolResult{}, fmt.Errorf("%w: publication requires a durable approved action", domain.ErrForbidden)
	}
	return ToolResult{}, fmt.Errorf("%w: tool has no executor", domain.ErrInvalid)
}

func projectRevision(project repository.ProjectModel) string {
	return secretutil.Digest(fmt.Sprintf("%s:%s:%t:%s", project.ID, project.AutomationLevel, project.IsPaused, project.UpdatedAt.UTC().Format(time.RFC3339Nano)))
}
func (uc *CopilotUsecase) preparePreview(ctx context.Context, projectID uuid.UUID, name, args string) (*CopilotActionPreview, error) {
	schema, server, _, err := uc.findTool(ctx, projectID, name)
	if err != nil {
		return nil, err
	}
	if err = validateToolArgs(schema, args); err != nil {
		return nil, err
	}
	actor := domain.ActorFrom(ctx)
	if !domain.CanReview(actor.Role) {
		return nil, domain.ErrForbidden
	}
	project, err := uc.projectRepo.GetProject(ctx, projectID)
	if err != nil {
		return nil, err
	}
	if project.IsPaused {
		return nil, domain.ErrPaused
	}
	details := map[string]interface{}{}
	_ = json.Unmarshal([]byte(args), &details)
	preview := &CopilotActionPreview{InterruptID: uuid.NewString(), CardType: "preview_tool", Title: "外部工具执行确认", Description: "确认后投递持久任务；执行结果以任务记录为准。", Details: details, ToolName: name, ToolArgs: args, ProjectRevision: projectRevision(*project)}
	schemaRaw, _ := json.Marshal(schema)
	preview.ToolSchemaHash = secretutil.Digest(string(schemaRaw))
	if server != nil {
		preview.ServerUpdatedAt = server.UpdatedAt
		return preview, nil
	}
	switch name {
	case "update_schedule_config":
		preview.CardType = "preview_schedule"
		preview.Title = "定时调度变更确认"
		var a scheduleArgs
		if err = json.Unmarshal([]byte(args), &a); err != nil {
			return nil, err
		}
		if _, err = nextSchedule(*project, a, time.Now()); err != nil {
			return nil, err
		}
	case "publish_content_to_channel":
		preview.CardType = "preview_publish"
		preview.Title = "内容发布审批"
		var a publishArgs
		if err = json.Unmarshal([]byte(args), &a); err != nil {
			return nil, err
		}
		id, err := uuid.Parse(a.ContentID)
		if err != nil {
			return nil, domain.ErrInvalid
		}
		asset, err := uc.contentRepo.GetAsset(ctx, id)
		if err != nil {
			return nil, err
		}
		if asset.Status != "approved" {
			return nil, fmt.Errorf("%w: content must be approved before publication", domain.ErrConflict)
		}
		var channel repository.PublishChannelModel
		if err := uc.projectRepo.DB().WithContext(ctx).Where("id = ? AND project_id = ? AND is_active = true", a.Channel, projectID).First(&channel).Error; err != nil {
			return nil, err
		}
		preview.ContentVersion = asset.Version
		preview.ContentHash = secretutil.Digest(asset.ContentBody)
		preview.ServerUpdatedAt = channel.UpdatedAt
		preview.Details["content_version"] = asset.Version
		preview.Details["content_hash"] = preview.ContentHash
		preview.Details["content_title"] = asset.Title
		preview.Details["content_body"] = asset.ContentBody
		preview.Details["channel_name"] = channel.Name
		preview.Details["target_endpoint"] = channel.EndpointURL
	default:
		return nil, domain.ErrInvalid
	}
	return preview, nil
}

type approvedActionPayload struct {
	State     CopilotState `json:"state"`
	ExpiresAt time.Time    `json:"expires_at"`
}

func (uc *CopilotUsecase) QueueApprovedAction(ctx context.Context, sessionID, projectID, userID uuid.UUID, interruptID, action string) (uuid.UUID, error) {
	if action != "confirm" && action != "cancel" {
		return uuid.Nil, domain.ErrInvalid
	}
	actor := domain.ActorFrom(ctx)
	if actor.UserID != userID || actor.ProjectID != projectID || !domain.CanReview(actor.Role) {
		return uuid.Nil, domain.ErrForbidden
	}
	if _, err := uc.copilotRepo.GetSession(ctx, sessionID); err != nil {
		return uuid.Nil, err
	}
	jobID := uuid.New()
	err := uc.copilotRepo.DB().WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var cp repository.CopilotCheckpointModel
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("session_id = ? AND interrupt_id = ? AND status = 'pending' AND expires_at > ?", sessionID, interruptID, time.Now()).First(&cp).Error; err != nil {
			return domain.ErrConflict
		}
		if cp.PayloadHash != secretutil.Digest(cp.StateData) {
			return domain.ErrConflict
		}
		var state CopilotState
		if err := json.Unmarshal([]byte(cp.StateData), &state); err != nil {
			return err
		}
		if state.ProjectID != projectID || state.UserID != userID || state.PendingAction == nil || state.InterruptID != interruptID {
			return domain.ErrForbidden
		}
		status := "cancelled"
		if action == "confirm" {
			status = "queued"
			raw, _ := json.Marshal(approvedActionPayload{state, cp.ExpiresAt})
			if err := repository.EnqueueJob(tx, &repository.JobModel{BaseGormModel: repository.BaseGormModel{ID: jobID}, ProjectID: projectID, Kind: "approved_action", Payload: string(raw), MaxAttempts: 1, IdempotencyKey: "approval:" + interruptID}); err != nil {
				return err
			}
		}
		result := tx.Model(&repository.CopilotCheckpointModel{}).Where("id = ? AND status = 'pending'", cp.ID).Update("status", status)
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return domain.ErrConflict
		}
		if err := tx.Model(&repository.CopilotMessageModel{}).Where("session_id = ? AND card_status = 'pending'", sessionID).Update("card_status", status).Error; err != nil {
			return err
		}
		return tx.Create(&repository.CopilotAuditLogModel{ProjectID: projectID, UserID: userID, SessionID: sessionID, ToolName: state.PendingAction.ToolName, InputPayload: redactJSON(state.PendingAction.ToolArgs), ExecutionRisk: "confirmed", UserConfirmed: action == "confirm", ExecutionStatus: status, ExecutedAt: time.Now()}).Error
	})
	return jobID, err
}

func (uc *CopilotUsecase) HandleApprovedJob(ctx context.Context, job repository.JobModel) error {
	var payload approvedActionPayload
	if err := json.Unmarshal([]byte(job.Payload), &payload); err != nil {
		return err
	}
	state := payload.State
	if state.ProjectID != job.ProjectID || state.PendingAction == nil {
		return domain.ErrInvalid
	}
	db := uc.projectRepo.DB().WithContext(ctx)
	var user repository.UserModel
	if err := db.Where("id = ? AND status = 'active'", state.UserID).First(&user).Error; err != nil {
		return domain.ErrForbidden
	}
	project, err := uc.projectRepo.GetProject(ctx, job.ProjectID)
	if err != nil {
		return err
	}
	role := user.Role
	if user.OrganizationID != project.OrganizationID {
		return domain.ErrForbidden
	}
	if role != "admin" && role != "owner" {
		var membership repository.ProjectMemberModel
		if err = db.Where("project_id = ? AND user_id = ?", job.ProjectID, user.ID).First(&membership).Error; err != nil {
			return domain.ErrForbidden
		}
		role = membership.Role
	}
	if !domain.CanReview(role) || project.IsPaused || projectRevision(*project) != state.PendingAction.ProjectRevision || time.Now().After(payload.ExpiresAt) {
		return domain.ErrConflict
	}
	ctx = domain.WithActor(ctx, domain.Actor{UserID: user.ID, OrganizationID: user.OrganizationID, ProjectID: job.ProjectID, Role: role})
	schema, server, _, err := uc.findTool(ctx, job.ProjectID, state.PendingAction.ToolName)
	if err != nil {
		return err
	}
	schemaRaw, _ := json.Marshal(schema)
	if secretutil.Digest(string(schemaRaw)) != state.PendingAction.ToolSchemaHash {
		return domain.ErrConflict
	}
	if server != nil && !server.UpdatedAt.Equal(state.PendingAction.ServerUpdatedAt) {
		return domain.ErrConflict
	}
	if err = verifyLease(db, job); err != nil {
		return err
	}
	var result ToolResult
	if state.PendingAction.ToolName == "publish_content_to_channel" {
		result, err = uc.publishApproved(ctx, job, *state.PendingAction)
	} else {
		if state.PendingAction.ToolName == "update_schedule_config" {
			err = db.Transaction(func(tx *gorm.DB) error {
				if err := verifyLease(tx, job); err != nil {
					return err
				}
				copyUC := *uc
				copyUC.projectRepo = repository.NewProjectRepository(tx)
				copyUC.harnessRepo = repository.NewHarnessRepository(tx)
				var executionErr error
				result, executionErr = copyUC.executeTool(ctx, job.ProjectID, state.PendingAction.ToolName, state.PendingAction.ToolArgs)
				return executionErr
			})
		} else {
			result, err = uc.executeTool(ctx, job.ProjectID, state.PendingAction.ToolName, state.PendingAction.ToolArgs)
		}
	}
	status := "completed"
	if err != nil {
		status = "failed"
		result.Summary = err.Error()
	}
	if persistErr := db.Transaction(func(tx *gorm.DB) error {
		if err := verifyLease(tx, job); err != nil {
			return err
		}
		if err := tx.Model(&repository.CopilotCheckpointModel{}).Where("session_id = ? AND interrupt_id = ?", state.SessionID, state.InterruptID).Update("status", status).Error; err != nil {
			return err
		}
		if err := tx.Model(&repository.CopilotMessageModel{}).Where("session_id = ? AND card_status = 'queued'", state.SessionID).Update("card_status", status).Error; err != nil {
			return err
		}
		if err := tx.Create(&repository.CopilotMessageModel{SessionID: state.SessionID, Role: "assistant", Content: result.Summary, CardStatus: status}).Error; err != nil {
			return err
		}
		return tx.Create(&repository.CopilotAuditLogModel{ProjectID: job.ProjectID, UserID: user.ID, SessionID: state.SessionID, ToolName: state.PendingAction.ToolName, InputPayload: redactJSON(state.PendingAction.ToolArgs), ExecutionRisk: "confirmed", UserConfirmed: true, ExecutionStatus: status, ExecutedAt: time.Now()}).Error
	}); persistErr != nil {
		return persistErr
	}
	if uc.hub != nil {
		uc.hub.BroadcastProject(job.ProjectID, "action:completed", "copilot", map[string]interface{}{"session_id": state.SessionID, "job_id": job.ID, "status": status, "summary": result.Summary})
	}
	return err
}

func (uc *CopilotUsecase) publishApproved(ctx context.Context, job repository.JobModel, preview CopilotActionPreview) (ToolResult, error) {
	var args publishArgs
	if err := json.Unmarshal([]byte(preview.ToolArgs), &args); err != nil {
		return ToolResult{}, err
	}
	db := uc.projectRepo.DB().WithContext(ctx)
	var asset repository.ContentAssetModel
	var channel repository.PublishChannelModel
	var publication repository.PublicationModel
	key := "publish:" + preview.InterruptID
	err := db.Transaction(func(tx *gorm.DB) error {
		if err := verifyLease(tx, job); err != nil {
			return err
		}
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("id = ? AND project_id = ? AND status = 'approved' AND version = ?", args.ContentID, job.ProjectID, preview.ContentVersion).First(&asset).Error; err != nil {
			return err
		}
		if secretutil.Digest(asset.ContentBody) != preview.ContentHash {
			return domain.ErrConflict
		}
		if err := tx.Where("id = ? AND project_id = ? AND is_active = true", args.Channel, job.ProjectID).First(&channel).Error; err != nil {
			return err
		}
		if !channel.UpdatedAt.Equal(preview.ServerUpdatedAt) || channel.ChannelType != "webhook" {
			return domain.ErrConflict
		}
		err := tx.Where("idempotency_key = ?", key).First(&publication).Error
		if err == nil {
			if publication.Status == "published" {
				return nil
			}
			return publisher.ErrOutcomeUnknown
		}
		if err != gorm.ErrRecordNotFound {
			return err
		}
		publication = repository.PublicationModel{BaseGormModel: repository.BaseGormModel{ID: uuid.New()}, ProjectID: job.ProjectID, AssetID: asset.ID, AssetVersion: asset.Version, ChannelID: &channel.ID, ChannelType: channel.ChannelType, IdempotencyKey: key, Status: "publishing"}
		return tx.Create(&publication).Error
	})
	if err != nil {
		return ToolResult{}, err
	}
	if publication.Status == "published" {
		return ToolResult{Summary: "已核对既有发布回执：" + publication.TargetURL, Data: publication}, nil
	}
	receipt, executionErr := (publisher.Webhook{}).Publish(ctx, &domain.PublishPayload{Title: asset.Title, Content: asset.ContentBody, Format: "markdown", TargetSlug: "bgeo-" + publication.ID.String(), Metadata: map[string]interface{}{"publication_id": publication.ID, "asset_id": asset.ID, "asset_version": asset.Version, "content_hash": preview.ContentHash}}, map[string]string{"endpoint": channel.EndpointURL, "credential": channel.Credential, "idempotency_key": key})
	updates := map[string]interface{}{"status": "failed"}
	if executionErr != nil {
		updates["error_message"] = executionErr.Error()
		if errors.Is(executionErr, publisher.ErrOutcomeUnknown) {
			updates["status"] = "outcome_unknown"
		}
	} else {
		raw, _ := json.Marshal(receipt)
		updates["status"] = "published"
		updates["external_id"] = receipt.ExternalID
		updates["target_url"] = receipt.PublishedURL
		updates["receipt"] = string(raw)
		updates["published_at"] = time.Now()
	}
	// Persist the real receipt and follow-up task atomically, even if the request context was cancelled.
	persistCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := uc.projectRepo.DB().WithContext(persistCtx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(&repository.PublicationModel{}).Where("id = ? AND status = 'publishing'", publication.ID).Updates(updates).Error; err != nil {
			return err
		}
		if executionErr != nil {
			return nil
		}
		return repository.EnqueueJob(tx, &repository.JobModel{ProjectID: job.ProjectID, Kind: "scheduled_monitor", Payload: "{}", IdempotencyKey: "retest:" + publication.ID.String(), AvailableAt: time.Now().Add(48 * time.Hour)})
	}); err != nil {
		return ToolResult{}, err
	}
	if executionErr != nil {
		return ToolResult{Data: publication}, executionErr
	}
	return ToolResult{Summary: "发布已确认：" + receipt.PublishedURL + "；复测任务已预约。", Data: receipt}, nil
}

func nextSchedule(project repository.ProjectModel, args scheduleArgs, now time.Time) (time.Time, error) {
	loc, err := time.LoadLocation(project.Timezone)
	if err != nil {
		return time.Time{}, fmt.Errorf("%w: invalid project timezone", domain.ErrInvalid)
	}
	if args.TimeSlot == "" {
		args.TimeSlot = "09:00"
	}
	slot, err := time.Parse("15:04", args.TimeSlot)
	if err != nil {
		return time.Time{}, domain.ErrInvalid
	}
	local := now.In(loc)
	next := time.Date(local.Year(), local.Month(), local.Day(), slot.Hour(), slot.Minute(), 0, 0, loc)
	switch args.Frequency {
	case "hourly":
		return now.Truncate(time.Hour).Add(time.Hour), nil
	case "daily":
		if !next.After(now) {
			next = next.AddDate(0, 0, 1)
		}
	case "weekly":
		if !next.After(now) {
			next = next.AddDate(0, 0, 7)
		}
	default:
		return time.Time{}, domain.ErrInvalid
	}
	return next, nil
}
func (uc *CopilotUsecase) saveSchedule(ctx context.Context, projectID uuid.UUID, args scheduleArgs) (ToolResult, error) {
	project, err := uc.projectRepo.GetProject(ctx, projectID)
	if err != nil {
		return ToolResult{}, err
	}
	next, err := nextSchedule(*project, args, time.Now())
	if err != nil {
		return ToolResult{}, err
	}
	if args.TimeSlot == "" {
		args.TimeSlot = "09:00"
	}
	schedule := repository.ScheduleModel{ProjectID: projectID, Frequency: args.Frequency, TimeSlot: args.TimeSlot, NextRunAt: next, Version: 1}
	err = uc.projectRepo.DB().WithContext(ctx).Clauses(clause.OnConflict{Columns: []clause.Column{{Name: "project_id"}}, DoUpdates: clause.Assignments(map[string]interface{}{"frequency": args.Frequency, "time_slot": args.TimeSlot, "next_run_at": next, "version": gorm.Expr("schedule_models.version + 1"), "updated_at": time.Now()})}).Create(&schedule).Error
	return ToolResult{Summary: fmt.Sprintf("调度配置已保存；下次执行：%s。", next.Format(time.RFC3339)), Data: schedule}, err
}
func (uc *CopilotUsecase) DispatchSchedules(ctx context.Context) error {
	db := uc.projectRepo.DB().WithContext(ctx)
	var schedules []repository.ScheduleModel
	if err := db.Where("next_run_at <= ? AND project_id IN (SELECT id FROM projects WHERE is_paused = false AND automation_level IN ('L2','L3') AND deleted_at IS NULL)", time.Now()).Limit(100).Find(&schedules).Error; err != nil {
		return err
	}
	for _, scheduled := range schedules {
		err := db.Transaction(func(tx *gorm.DB) error {
			var schedule repository.ScheduleModel
			if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("project_id = ? AND next_run_at <= ? AND version = ?", scheduled.ProjectID, time.Now(), scheduled.Version).First(&schedule).Error; err != nil {
				if err == gorm.ErrRecordNotFound {
					return nil
				}
				return err
			}
			var project repository.ProjectModel
			if err := tx.Where("id = ?", schedule.ProjectID).First(&project).Error; err != nil {
				return err
			}
			monitor := NewMonitorUsecase(repository.NewMonitorRepository(tx), repository.NewOpportunityRepository(tx), uc.monitorUC.connector, uc.hub)
			if _, err := monitor.ExecuteBatchRun(domain.WithProject(ctx, project.ID), project.ID); err != nil {
				if !errors.Is(err, domain.ErrConflict) && !errors.Is(err, domain.ErrInvalid) {
					return err
				}
			}
			next, err := nextSchedule(project, scheduleArgs{Frequency: schedule.Frequency, TimeSlot: schedule.TimeSlot}, time.Now())
			if err != nil {
				return err
			}
			return tx.Model(&schedule).Updates(map[string]interface{}{"next_run_at": next, "version": schedule.Version + 1}).Error
		})
		if err != nil {
			return err
		}
	}
	return nil
}

func redactJSON(raw string) string {
	var value interface{}
	if json.Unmarshal([]byte(raw), &value) != nil {
		return "[invalid JSON]"
	}
	var redact func(interface{})
	redact = func(v interface{}) {
		switch x := v.(type) {
		case map[string]interface{}:
			for k, v := range x {
				lower := strings.ToLower(k)
				if strings.Contains(lower, "token") || strings.Contains(lower, "secret") || strings.Contains(lower, "password") || strings.Contains(lower, "credential") || lower == "authorization" || lower == "api_key" || lower == "auth_headers" {
					x[k] = "[redacted]"
				} else {
					redact(v)
				}
			}
		case []interface{}:
			for _, v := range x {
				redact(v)
			}
		}
	}
	redact(value)
	b, _ := json.Marshal(value)
	return string(b)
}

func (uc *CopilotUsecase) PrepareAction(ctx context.Context, sessionID uuid.UUID, args string) (*CopilotActionPreview, error) {
	actor := domain.ActorFrom(ctx)
	preview, err := uc.preparePreview(ctx, actor.ProjectID, "publish_content_to_channel", args)
	if err != nil {
		return nil, err
	}
	state := CopilotState{SessionID: sessionID, ProjectID: actor.ProjectID, UserID: actor.UserID, PendingAction: preview, IsInterrupted: true, InterruptID: preview.InterruptID}
	raw, _ := json.Marshal(state)
	err = uc.copilotRepo.DB().WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		repo := repository.NewCopilotRepository(tx)
		if err := repo.SaveCheckpoint(ctx, &repository.CopilotCheckpointModel{SessionID: sessionID, ThreadID: sessionID.String(), StateData: string(raw), InterruptID: preview.InterruptID}); err != nil {
			return err
		}
		card, _ := json.Marshal(preview)
		return repo.SaveMessage(ctx, &repository.CopilotMessageModel{SessionID: sessionID, Role: "assistant", Content: "请核对发布内容版本和渠道。", CardType: preview.CardType, CardPayload: string(card), CardStatus: "pending"})
	})
	return preview, err
}
