package domain

import (
	"context"
)

type SampleOptions struct {
	EngineParams map[string]interface{} `json:"engine_params"`
	MaxTokens    int                    `json:"max_tokens"`
	Temperature  float32                `json:"temperature"`
	TimeoutSec   int                    `json:"timeout_sec"`
}

type ParsedEntity struct {
	Name       string `json:"name"`
	IsBrand    bool   `json:"is_brand"`
	Position   int    `json:"position"`
	IsPositive bool   `json:"is_positive"`
	Context    string `json:"context"`
}

type ParsedCitation struct {
	URL     string `json:"url"`
	Domain  string `json:"domain"`
	Snippet string `json:"snippet"`
	IsOwned bool   `json:"is_owned"`
}

type SamplingResult struct {
	Source       string           `json:"source"`
	RawText      string           `json:"raw_text"`
	Entities     []ParsedEntity   `json:"entities"`
	Citations    []ParsedCitation `json:"citations"`
	IsRefusal    bool             `json:"is_refusal"`
	ModelVersion string           `json:"model_version"`
	Confidence   float64          `json:"confidence"`
	TokensUsed   int              `json:"tokens_used"`
}

// AISearchConnector defines the SPI for sampling questions from AI engines
type AISearchConnector interface {
	ChannelID() string // e.g. "perplexity", "deepseek", "openai_search", "kimi"
	DisplayName() string
	Sample(ctx context.Context, query string, opts SampleOptions) (*SamplingResult, error)
	ValidateCredential(ctx context.Context, config map[string]string) error
}

type PublishPayload struct {
	Title      string                 `json:"title"`
	Content    string                 `json:"content"`
	Format     string                 `json:"format"` // html, markdown, schema_json
	TargetSlug string                 `json:"target_slug"`
	Metadata   map[string]interface{} `json:"metadata"`
}

type PublishReceipt struct {
	ExternalID   string `json:"external_id"`
	PublishedURL string `json:"published_url"`
	VersionID    string `json:"version_id"`
}

// PublisherConnector defines the SPI for distributing content to external CMS or Webhooks
type PublisherConnector interface {
	ChannelType() string // e.g. "wordpress", "rest_api", "custom_webhook"
	Publish(ctx context.Context, payload *PublishPayload, target map[string]string) (*PublishReceipt, error)
	Unpublish(ctx context.Context, receipt *PublishReceipt) error
}
