package domain

import (
	"time"

	"github.com/google/uuid"
)

type ContentAssetType string

const (
	AssetArticle       ContentAssetType = "article"
	AssetFAQ           ContentAssetType = "faq"
	AssetLandingModule ContentAssetType = "landing_module"
	AssetFactProfile   ContentAssetType = "entity_profile"
)

// ContentAsset represents a piece of content generated, reviewed, and published
type ContentAsset struct {
	ID            uuid.UUID              `json:"id"`
	ProjectID     uuid.UUID              `json:"project_id"`
	StrategyID    *uuid.UUID             `json:"strategy_id,omitempty"`
	Title         string                 `json:"title"`
	AssetType     ContentAssetType       `json:"asset_type"`
	Brief         map[string]interface{} `json:"brief"`
	ContentBody   string                 `json:"content_body"` // Markdown or HTML
	Version       int                    `json:"version"`
	QualityChecks map[string]interface{} `json:"quality_checks"` // fact checks, forbidden words
	Status        string                 `json:"status"`         // draft, verifying, pending_approval, approved, published
	CreatedAt     time.Time              `json:"created_at"`
	UpdatedAt     time.Time              `json:"updated_at"`
}
