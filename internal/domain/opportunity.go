package domain

import (
	"time"

	"github.com/google/uuid"
)

type OpportunityType string

const (
	OppBrandAbsent     OpportunityType = "brand_absent"     // 品牌缺席
	OppRankLagging     OpportunityType = "rank_lagging"     // 推荐靠后
	OppCitationMissing OpportunityType = "citation_missing" // 引用缺失
	OppFactError       OpportunityType = "fact_error"       // 事实错误
	OppContentBlank    OpportunityType = "content_blank"    // 内容空白
	OppContentStale    OpportunityType = "content_stale"    // 内容过期
	OppCompetitorLead  OpportunityType = "competitor_lead"  // 竞品占位
	OppChannelSkew     OpportunityType = "channel_skew"     // 渠道偏差
)

// Opportunity represents an identified GEO improvement gap supported by evidence
type Opportunity struct {
	ID                uuid.UUID       `json:"id"`
	ProjectID         uuid.UUID       `json:"project_id"`
	Type              OpportunityType `json:"type"`
	Title             string          `json:"title"`
	Description       string          `json:"description"`
	Score             float64         `json:"score"`             // Composite score (0-100)
	ImpactScore       float64         `json:"impact_score"`      // 业务影响
	GapScore          float64         `json:"gap_score"`         // 当前差距
	FeasibilityScore  float64         `json:"feasibility_score"` // 可执行性
	ConfidenceScore   float64         `json:"confidence_score"`  // 证据置信度
	RiskCost          float64         `json:"risk_cost"`         // 风险成本
	Status            string          `json:"status"`            // new, confirmed, planning, executing, verifying, verified, ignored
	RecommendedAction string          `json:"recommended_action"`
	EvidenceIDs       []uuid.UUID     `json:"evidence_ids"`
	CreatedAt         time.Time       `json:"created_at"`
	UpdatedAt         time.Time       `json:"updated_at"`
}

// CalculateOpportunityScore calculates score using PRD formula:
// 0.30*Impact + 0.25*Gap + 0.20*Feasibility + 0.15*Confidence - 0.10*RiskCost
func CalculateOpportunityScore(impact, gap, feasibility, confidence, risk float64) float64 {
	score := 0.30*impact + 0.25*gap + 0.20*feasibility + 0.15*confidence - 0.10*risk
	if score < 0 {
		return 0
	}
	if score > 100 {
		return 100
	}
	return score
}
