package repository

import (
	"context"
	"fmt"
	"github.com/google/uuid"
	"github.com/robbinsz/bgeo/internal/config"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/driver/postgres"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
	"log"
	"os"
	"path/filepath"
	"time"
)

var DefaultProjectID = uuid.MustParse("00000000-0000-0000-0000-000000000001")
var DefaultOrgID = uuid.MustParse("00000000-0000-0000-0000-000000000000")

const SchemaVersion = 3

func SchemaModels() []interface{} {
	return []interface{}{
		&OrganizationModel{}, &ProjectModel{}, &UserModel{}, &RefreshTokenModel{}, &BrandFactModel{}, &CompetitorModel{}, &QueryModel{}, &MonitorRunModel{}, &AnswerSnapshotModel{}, &OpportunityModel{}, &StrategyModel{}, &StrategyTaskModel{}, &ContentAssetModel{}, &PublicationModel{}, &ExperimentModel{}, &RuleModel{}, &EvolutionRunModel{}, &AuditLogModel{}, &CopilotSessionModel{}, &CopilotMessageModel{}, &CopilotCheckpointModel{}, &CopilotAuditLogModel{}, &AIConfigModel{}, &HarnessConfigModel{}, &MCPServerModel{}, &MemoryEntryModel{}, &CustomSkillModel{}, &AgentExecutionTraceModel{}, &ProjectMemberModel{}, &JobModel{}, &ScheduleModel{}, &PublishChannelModel{}, &ModelCallModel{},
	}
}

func OpenDatabase(c config.Config) (*gorm.DB, error) {
	var dialector gorm.Dialector
	switch c.DBDriver {
	case "postgres":
		if c.DatabaseURL == "" {
			return nil, fmt.Errorf("DATABASE_URL is required")
		}
		dialector = postgres.Open(c.DatabaseURL)
	case "sqlite":
		if c.Environment == "production" {
			return nil, fmt.Errorf("SQLite is disabled in production")
		}
		if err := os.MkdirAll(filepath.Dir(c.SQLitePath), 0750); err != nil {
			return nil, err
		}
		dialector = sqlite.Open(c.SQLitePath + "?_busy_timeout=5000&_journal_mode=WAL&_foreign_keys=on")
	default:
		return nil, fmt.Errorf("unsupported database driver")
	}
	db, err := gorm.Open(dialector, &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	if err != nil {
		return nil, err
	}
	sqlDB, err := db.DB()
	if err != nil {
		return nil, err
	}
	sqlDB.SetMaxOpenConns(16)
	sqlDB.SetMaxIdleConns(4)
	sqlDB.SetConnMaxLifetime(30 * time.Minute)
	if c.DBDriver == "sqlite" {
		sqlDB.SetMaxOpenConns(1)
	}
	return db, nil
}

func Migrate(ctx context.Context, db *gorm.DB) error {
	return db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if tx.Dialector.Name() == "postgres" {
			if err := tx.Exec("SELECT pg_advisory_xact_lock(714029823)").Error; err != nil {
				return err
			}
		}
		if err := tx.AutoMigrate(&SchemaMigration{}); err != nil {
			return err
		}
		var version int64
		if err := tx.Model(&SchemaMigration{}).Select("COALESCE(MAX(version),0)").Scan(&version).Error; err != nil {
			return err
		}
		if version > SchemaVersion {
			return fmt.Errorf("database schema is newer than this binary")
		}
		for next := int(version) + 1; next <= SchemaVersion; next++ {
			switch next {
			case 1:
				if err := tx.AutoMigrate(SchemaModels()...); err != nil {
					return err
				}
			case 2:
				// Additive and transactional: existing credentials and job history are preserved.
				if !tx.Migrator().HasColumn(&UserModel{}, "AuthVersion") {
					if err := tx.Migrator().AddColumn(&UserModel{}, "AuthVersion"); err != nil {
						return err
					}
				}
				if !tx.Migrator().HasColumn(&JobModel{}, "ReconciledAt") {
					if err := tx.Migrator().AddColumn(&JobModel{}, "ReconciledAt"); err != nil {
						return err
					}
				}
				if err := tx.Exec("CREATE INDEX IF NOT EXISTS idx_job_reconciliation ON job_models (kind, status, reconciled_at, created_at, id)").Error; err != nil {
					return err
				}
			case 3:
				for _, constraint := range []struct {
					model interface{}
					name  string
				}{
					{&JobModel{}, "Project"}, {&ProjectMemberModel{}, "Project"}, {&ProjectMemberModel{}, "User"}, {&CopilotMessageModel{}, "Session"},
				} {
					if !tx.Migrator().HasConstraint(constraint.model, constraint.name) {
						if err := createConstraintPreservingIndexes(tx, constraint.model, constraint.name); err != nil {
							return fmt.Errorf("schema relationship %T.%s: %w", constraint.model, constraint.name, err)
						}
					}
				}
			}
			if err := tx.Create(&SchemaMigration{Version: next, AppliedAt: time.Now()}).Error; err != nil {
				return err
			}
		}
		return nil
	})
}

// SQLite rebuilds a table when adding a constraint, dropping its explicit indexes.
// Preserve the database's index definitions, including indexes outside GORM tags.
func createConstraintPreservingIndexes(db *gorm.DB, model interface{}, name string) error {
	var indexes []struct {
		Name string
		SQL  string
	}
	if db.Dialector.Name() == "sqlite" {
		stmt := &gorm.Statement{DB: db}
		if err := stmt.Parse(model); err != nil {
			return err
		}
		if err := db.Raw("SELECT name, sql FROM sqlite_master WHERE type = 'index' AND tbl_name = ? AND sql IS NOT NULL", stmt.Table).Scan(&indexes).Error; err != nil {
			return err
		}
	}
	if err := db.Migrator().CreateConstraint(model, name); err != nil {
		return err
	}
	for _, index := range indexes {
		if !db.Migrator().HasIndex(model, index.Name) {
			if err := db.Exec(index.SQL).Error; err != nil {
				return err
			}
		}
	}
	return nil
}

func VerifySchema(ctx context.Context, db *gorm.DB) error {
	db = db.WithContext(ctx)
	var version int64
	if err := db.WithContext(ctx).Model(&SchemaMigration{}).Select("COALESCE(MAX(version),0)").Scan(&version).Error; err != nil {
		return fmt.Errorf("schema is not ready; run the explicit migrate command: %w", err)
	}
	if version != SchemaVersion {
		return fmt.Errorf("schema version mismatch: database=%d binary=%d", version, SchemaVersion)
	}
	for _, model := range SchemaModels() {
		if !db.WithContext(ctx).Migrator().HasTable(model) {
			return fmt.Errorf("schema table missing for %T", model)
		}
	}
	if !db.Migrator().HasColumn(&UserModel{}, "AuthVersion") || !db.Migrator().HasColumn(&JobModel{}, "ReconciledAt") {
		return fmt.Errorf("schema columns missing; run the explicit migrate command")
	}
	for _, index := range []string{"idx_job_reconciliation", "idx_job_ready", "idx_job_models_idempotency_key"} {
		if !db.Migrator().HasIndex(&JobModel{}, index) {
			return fmt.Errorf("schema job index missing: %s", index)
		}
	}
	for _, constraint := range []struct {
		model interface{}
		name  string
	}{{&JobModel{}, "Project"}, {&ProjectMemberModel{}, "Project"}, {&ProjectMemberModel{}, "User"}, {&CopilotMessageModel{}, "Session"}} {
		if !db.WithContext(ctx).Migrator().HasConstraint(constraint.model, constraint.name) {
			return fmt.Errorf("schema relationship missing for %T.%s", constraint.model, constraint.name)
		}
	}
	return nil
}

func InitDB() (*gorm.DB, error) {
	c, err := config.Load()
	if err != nil {
		return nil, err
	}
	db, err := OpenDatabase(c)
	if err != nil {
		return nil, err
	}
	if c.AutoMigrate {
		if err = Migrate(context.Background(), db); err != nil {
			return nil, err
		}
	}
	if err = VerifySchema(context.Background(), db); err != nil {
		return nil, err
	}
	if c.SeedDemo {
		if err = SeedDemo(db); err != nil {
			return nil, err
		}
	}
	return db, nil
}

func SeedDemo(db *gorm.DB) error {
	if !config.Demo() {
		return fmt.Errorf("demo seeding is disabled in live mode")
	}
	return db.Transaction(seedInitialData)
}

func seedInitialData(db *gorm.DB) error {
	var count int64
	if err := db.Model(&ProjectModel{}).Where("id = ?", DefaultProjectID).Count(&count).Error; err != nil {
		return err
	}
	if count > 0 {
		return nil
	}

	log.Println("[DB] Seeding initial GeoPilot demo data for Bgeo...")

	// 1. Organization
	org := OrganizationModel{
		BaseGormModel: BaseGormModel{ID: DefaultOrgID},
		Name:          "Bgeo",
		Plan:          "enterprise",
		Status:        "active",
	}
	if err := db.Create(&org).Error; err != nil {
		return err
	}

	// 1.1 Default Admin User (admin@bgeo.cc / admin123)
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte("admin123"), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	defaultUser := UserModel{
		BaseGormModel:  BaseGormModel{ID: uuid.MustParse("00000000-0000-0000-0000-000000000001")},
		OrganizationID: org.ID,
		Email:          "admin@bgeo.cc",
		PasswordHash:   string(hashedPassword),
		Name:           "Bgeo",
		Role:           "admin",
		Team:           "增长团队",
		Avatar:         "",
		AvatarBg:       "#f5d8a8",
		AvatarLetter:   "B",
		Status:         "active",
	}
	if err := db.Create(&defaultUser).Error; err != nil {
		return err
	}

	// 2. Project
	proj := ProjectModel{
		BaseGormModel:   BaseGormModel{ID: DefaultProjectID},
		OrganizationID:  org.ID,
		Name:            "Bgeo · GEO 项目",
		BrandName:       "Bgeo",
		BrandAliases:    `["Bgeo","bgeo","bgeo.cc","BGEO","Bgeo平台"]`,
		Region:          "zh-CN",
		Language:        "zh",
		Timezone:        "Asia/Shanghai",
		AutomationLevel: "L2",
		IsPaused:        false,
		ReadinessScore:  88,
	}
	if err := db.Create(&proj).Error; err != nil {
		return err
	}

	// 3. Competitors
	competitors := []CompetitorModel{
		{BaseGormModel: BaseGormModel{ID: uuid.New()}, ProjectID: DefaultProjectID, Name: "安心到家", Domain: "anxindaojia.com"},
		{BaseGormModel: BaseGormModel{ID: uuid.New()}, ProjectID: DefaultProjectID, Name: "好慷在家", Domain: "haokang.com"},
		{BaseGormModel: BaseGormModel{ID: uuid.New()}, ProjectID: DefaultProjectID, Name: "天鹅到家", Domain: "daojia.com"},
		{BaseGormModel: BaseGormModel{ID: uuid.New()}, ProjectID: DefaultProjectID, Name: "轻喜到家", Domain: "qingxi.com"},
	}
	if err := db.Create(&competitors).Error; err != nil {
		return err
	}

	// 4. Brand Facts
	facts := []BrandFactModel{
		{
			BaseGormModel: BaseGormModel{ID: uuid.New()},
			ProjectID:     DefaultProjectID,
			FactType:      "qualification",
			Statement:     "Bgeo (bgeo.cc) 具备权威大模型检索增强优化服务资质，全链路支持主流生成式引擎 GEO 可见度与品牌声量诊断。",
			Source:        "bgeo.cc 官方平台服务规范",
			Confidence:    1.0,
			Status:        "approved",
			Version:       1,
		},
		{
			BaseGormModel: BaseGormModel{ID: uuid.New()},
			ProjectID:     DefaultProjectID,
			FactType:      "pricing",
			Statement:     "开荒保洁收费标准为 8-12 元/平米，无隐形加价，附带 8 大类验收检查清单与 72 小时无条件返工承诺。",
			Source:        "bgeo.cc 官方公示价目表",
			Confidence:    1.0,
			Status:        "approved",
			Version:       1,
		},
		{
			BaseGormModel: BaseGormModel{ID: uuid.New()},
			ProjectID:     DefaultProjectID,
			FactType:      "service_scope",
			Statement:     "服务范围覆盖武汉市主城区及江夏、东西湖核心商住区，客服响应时间小于 2 小时。",
			Source:        "营业执照及服务网点公报",
			Confidence:    0.98,
			Status:        "approved",
			Version:       1,
		},
	}
	if err := db.Create(&facts).Error; err != nil {
		return err
	}

	// 5. Initial Queries
	queries := []QueryModel{
		{BaseGormModel: BaseGormModel{ID: uuid.New()}, ProjectID: DefaultProjectID, QueryText: "武汉家政公司哪家靠谱？", Topic: "商业决策", Intent: "commercial", BusinessValue: 95, Priority: "critical", Status: "active"},
		{BaseGormModel: BaseGormModel{ID: uuid.New()}, ProjectID: DefaultProjectID, QueryText: "开荒保洁一般多少钱？", Topic: "价格咨询", Intent: "commercial", BusinessValue: 90, Priority: "high", Status: "active"},
		{BaseGormModel: BaseGormModel{ID: uuid.New()}, ProjectID: DefaultProjectID, QueryText: "请保姆需要注意哪些问题？", Topic: "知识咨询", Intent: "informational", BusinessValue: 70, Priority: "medium", Status: "active"},
		{BaseGormModel: BaseGormModel{ID: uuid.New()}, ProjectID: DefaultProjectID, QueryText: "家政服务怎么选不踩坑？", Topic: "服务决策", Intent: "commercial", BusinessValue: 88, Priority: "high", Status: "active"},
		{BaseGormModel: BaseGormModel{ID: uuid.New()}, ProjectID: DefaultProjectID, QueryText: "住家育儿嫂主要负责什么？", Topic: "知识咨询", Intent: "informational", BusinessValue: 75, Priority: "medium", Status: "active"},
		{BaseGormModel: BaseGormModel{ID: uuid.New()}, ProjectID: DefaultProjectID, QueryText: "深度保洁和日常保洁区别？", Topic: "服务决策", Intent: "commercial", BusinessValue: 82, Priority: "medium", Status: "active"},
	}
	if err := db.Create(&queries).Error; err != nil {
		return err
	}

	// 6. Opportunities
	opps := []OpportunityModel{
		{
			BaseGormModel:     BaseGormModel{ID: uuid.New()},
			ProjectID:         DefaultProjectID,
			Type:              "brand_absent",
			Title:             "武汉家政公司权威对比指南",
			Description:       "4 个引擎未提及品牌，竞品安心到家覆盖率高出 31%",
			Score:             91.0,
			ImpactScore:       95.0,
			GapScore:          88.0,
			FeasibilityScore:  90.0,
			ConfidenceScore:   92.0,
			RiskCost:          10.0,
			Status:            "new",
			RecommendedAction: "补齐武汉家政对比型内容集群与第三方信用背书",
		},
		{
			BaseGormModel:     BaseGormModel{ID: uuid.New()},
			ProjectID:         DefaultProjectID,
			Type:              "citation_missing",
			Title:             "公开服务验收标准与赔付承诺",
			Description:       "高频价格问题 18 个，当前引用源可信度不足",
			Score:             83.0,
			ImpactScore:       85.0,
			GapScore:          80.0,
			FeasibilityScore:  85.0,
			ConfidenceScore:   88.0,
			RiskCost:          12.0,
			Status:            "new",
			RecommendedAction: "增加 FAQ 结构化数据与计价依据页面",
		},
		{
			BaseGormModel:     BaseGormModel{ID: uuid.New()},
			ProjectID:         DefaultProjectID,
			Type:              "content_blank",
			Title:             "创建开荒保洁验收标准权威指南",
			Description:       "内容缺口明确，月均生成式问答需求约 2,400 次",
			Score:             76.0,
			ImpactScore:       78.0,
			GapScore:          74.0,
			FeasibilityScore:  80.0,
			ConfidenceScore:   82.0,
			RiskCost:          10.0,
			Status:            "new",
			RecommendedAction: "基于已核验事实库生成开荒保洁标准说明",
		},
	}
	if err := db.Create(&opps).Error; err != nil {
		return err
	}

	// 7. Evolution Rules
	rules := []RuleModel{
		{
			BaseGormModel: BaseGormModel{ID: uuid.New()},
			ProjectID:     DefaultProjectID,
			RuleName:      "价格内容采用“范围＋因素＋账单示例”结构",
			Category:      "template_strategy",
			ConditionExpr: "query.intent == 'commercial' && content.type == 'pricing'",
			ActionType:    "apply_structure",
			ActionPayload: `{"structure": ["price_range", "variable_factors", "sample_bill"]}`,
			Status:        "stable",
			Version:       "v2.8",
			SampleSize:    42,
			ImpactScore:   24.0,
			ApprovedAt:    &time.Time{},
		},
		{
			BaseGormModel: BaseGormModel{ID: uuid.New()},
			ProjectID:     DefaultProjectID,
			RuleName:      "本地案例至少包含区县、户型和验收数据",
			Category:      "template_strategy",
			ConditionExpr: "query.region != '' && content.type == 'case_study'",
			ActionType:    "require_entities",
			ActionPayload: `{"required_fields": ["district", "apartment_type", "acceptance_metrics"]}`,
			Status:        "candidate",
			Version:       "v2.9-rc1",
			SampleSize:    28,
			ImpactScore:   15.0,
		},
	}
	if err := db.Create(&rules).Error; err != nil {
		return err
	}

	// 8. Experiments
	experiments := []ExperimentModel{
		{
			BaseGormModel: BaseGormModel{ID: uuid.New()},
			ProjectID:     DefaultProjectID,
			Title:         "FAQ 结构化数据对价格问题引用的影响",
			Hypothesis:    "增加 FAQ Schema 和明确更新时间能提升引用率",
			BaselineRate:  5.0,
			VariantRate:   24.0,
			Confidence:    86.0,
			Status:        "running",
			CurrentDays:   8,
			TotalDays:     14,
		},
		{
			BaseGormModel: BaseGormModel{ID: uuid.New()},
			ProjectID:     DefaultProjectID,
			Title:         "表格化服务标准 vs. 长段落说明",
			Hypothesis:    "表格结构显著提高了 AI 对验收项目边界的抽取准确度",
			BaselineRate:  -1.0,
			VariantRate:   31.0,
			Confidence:    96.0,
			Status:        "won",
			CurrentDays:   14,
			TotalDays:     14,
		},
	}
	if err := db.Create(&experiments).Error; err != nil {
		return err
	}

	// 9. Strategies
	strategies := []StrategyModel{
		{
			BaseGormModel: BaseGormModel{ID: uuid.New()},
			ProjectID:     DefaultProjectID,
			Title:         "武汉家政品牌对比内容集群",
			Objective:     "覆盖 16 个高商业意图问题，补齐竞品领先主题",
			Hypothesis:    "建立全面品牌对比指南将提升品牌在商业决策问题中的被引率",
			RiskLevel:     "low",
			Status:        "backlog",
			Assignee:      "策略工作流",
		},
		{
			BaseGormModel: BaseGormModel{ID: uuid.New()},
			ProjectID:     DefaultProjectID,
			Title:         "建立服务价格知识图谱",
			Objective:     "统一价格区间、增项和城市差异",
			Hypothesis:    "公开透明的计价图谱可提升价格问答中的引用权重",
			RiskLevel:     "low",
			Status:        "backlog",
			Assignee:      "策略工作流",
		},
		{
			BaseGormModel: BaseGormModel{ID: uuid.New()},
			ProjectID:     DefaultProjectID,
			Title:         "整理 20 个真实服务问答",
			Objective:     "从客服会话提炼结构化 FAQ",
			Hypothesis:    "高频问答沉淀为结构化数据可直接被 AI 引用",
			RiskLevel:     "low",
			Status:        "backlog",
			Assignee:      "小林",
		},
		{
			BaseGormModel: BaseGormModel{ID: uuid.New()},
			ProjectID:     DefaultProjectID,
			Title:         "开荒保洁验收标准指南",
			Objective:     "正在生成初稿与引用证据清单",
			Hypothesis:    "逐项验收表格比长文本更易被结构化提取",
			RiskLevel:     "medium",
			Status:        "production",
			Assignee:      "内容工作流",
		},
		{
			BaseGormModel: BaseGormModel{ID: uuid.New()},
			ProjectID:     DefaultProjectID,
			Title:         "育儿嫂筛选 12 项标准",
			Objective:     "内容结构已完成，等待案例数据",
			Hypothesis:    "提供量化筛选维度可提高决策类问答的权威度",
			RiskLevel:     "low",
			Status:        "production",
			Assignee:      "内容工作流",
		},
		{
			BaseGormModel: BaseGormModel{ID: uuid.New()},
			ProjectID:     DefaultProjectID,
			Title:         "家政服务避坑清单",
			Objective:     "事实校验通过，含 3 处品牌承诺",
			Hypothesis:    "避坑类内容具有极高分享率与第三方引用意愿",
			RiskLevel:     "medium",
			Status:        "review",
			Assignee:      "周主管",
		},
		{
			BaseGormModel: BaseGormModel{ID: uuid.New()},
			ProjectID:     DefaultProjectID,
			Title:         "空调清洗服务流程",
			Objective:     "计划同步至官网、知乎和公众号",
			Hypothesis:    "多渠道同步分发可加速大模型搜索引擎收录",
			RiskLevel:     "low",
			Status:        "review",
			Assignee:      "发布工作流",
		},
		{
			BaseGormModel: BaseGormModel{ID: uuid.New()},
			ProjectID:     DefaultProjectID,
			Title:         "保洁阿姨怎么选？",
			Objective:     "发布 14 天后，5 个引擎覆盖从 20% 提升到 80%",
			Hypothesis:    "权威选人指南直接抢占头部通用问答",
			RiskLevel:     "low",
			Status:        "analyzing",
			Assignee:      "GEO闭环",
		},
	}
	if err := db.Create(&strategies).Error; err != nil {
		return err
	}

	// 10. Content Assets
	assets := []ContentAssetModel{
		{
			BaseGormModel: BaseGormModel{ID: uuid.New()},
			ProjectID:     DefaultProjectID,
			Title:         "武汉家政公司怎么选：12 项核验清单",
			AssetType:     "guide",
			Brief:         `{"summary": "对比服务资质、人员审核、保险、价格与售后机制", "opportunity_score": 91}`,
			ContentBody:   "选择靠谱家政公司需核验：1. 服务资质；2. 员工身份与无犯罪记录；3. 雇主责任险；4. 透明价格表；5. 售后无忧保障...",
			Status:        "pending_approval",
		},
		{
			BaseGormModel: BaseGormModel{ID: uuid.New()},
			ProjectID:     DefaultProjectID,
			Title:         "开荒保洁验收标准：逐项检查表",
			AssetType:     "checklist",
			Brief:         `{"summary": "覆盖厨房、卫生间、玻璃、地面等 8 类验收项目", "opportunity_score": 88}`,
			ContentBody:   "开荒保洁标准检查项包含：双面玻璃透光无水印、门窗轨道无泥沙、瓷砖表面无漆点胶痕、五金卫浴水垢彻底清除...",
			Status:        "generating",
		},
		{
			BaseGormModel: BaseGormModel{ID: uuid.New()},
			ProjectID:     DefaultProjectID,
			Title:         "2026 武汉保洁服务收费参考",
			AssetType:     "pricing",
			Brief:         `{"summary": "按房屋面积、服务类型与特殊增项解释计价逻辑", "citations": 18}`,
			ContentBody:   "开荒保洁收费标准为 8-12 元/平米，无隐形加价，日常保洁 45-60 元/小时，深度保洁按居室核定...",
			Status:        "published",
		},
		{
			BaseGormModel: BaseGormModel{ID: uuid.New()},
			ProjectID:     DefaultProjectID,
			Title:         "育儿嫂面试：12 个关键问题与判断标准",
			AssetType:     "guide",
			Brief:         `{"summary": "整理用户真实问题，并映射可验证的服务能力证据", "opportunity_score": 79}`,
			ContentBody:   "考察育儿嫂经验的 12 项关键问题：新生儿黄疸观察、辅食添加原则、睡眠训练与急救常识...",
			Status:        "researching",
		},
		{
			BaseGormModel: BaseGormModel{ID: uuid.New()},
			ProjectID:     DefaultProjectID,
			Title:         "家政服务人员审核流程公开说明",
			AssetType:     "policy",
			Brief:         `{"summary": "身份、健康、背景、技能与持续服务评价的完整流程", "citations": 11}`,
			ContentBody:   "Bgeo 平台实施 5 重审核机制：凭据真实性校验、模型幻觉消解、权威源溯源、内容合规与持续效果跟踪...",
			Status:        "published",
		},
		{
			BaseGormModel: BaseGormModel{ID: uuid.New()},
			ProjectID:     DefaultProjectID,
			Title:         "洪山区 120㎡ 新房开荒保洁案例",
			AssetType:     "case_study",
			Brief:         `{"summary": "真实服务步骤、耗时、人员配置和客户验收记录", "completeness": "46%"}`,
			ContentBody:   "户型：3室2厅2卫；耗时：6.5小时；配置：3名甲级保洁师；客户评分：5.0星...",
			Status:        "draft",
		},
	}
	if err := db.Create(&assets).Error; err != nil {
		return err
	}

	log.Println("[DB] Initial demo data seeded successfully!")
	return nil
}
