package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"github.com/robbinsz/bgeo/internal/config"
	"github.com/robbinsz/bgeo/pkg/outbound"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/robbinsz/bgeo/internal/domain"
)

type PerplexityConnector struct {
	apiKey      string
	model       string
	channelID   string
	displayName string
	httpClient  *http.Client
}

func NewPerplexityConnector() domain.AISearchConnector {
	key := os.Getenv("PERPLEXITY_API_KEY")
	if config.Demo() {
		return NewMockAISearchConnector("perplexity", "Perplexity Sonar")
	}
	return &PerplexityConnector{
		apiKey:      key,
		model:       "sonar",
		channelID:   "perplexity",
		displayName: "Perplexity Sonar",
		httpClient:  outbound.Client(30 * time.Second),
	}
}

func (p *PerplexityConnector) ChannelID() string {
	return p.channelID
}

func (p *PerplexityConnector) DisplayName() string {
	return p.displayName
}

func (p *PerplexityConnector) Sample(ctx context.Context, query string, opts domain.SampleOptions) (*domain.SamplingResult, error) {
	reqBody := map[string]interface{}{
		"model": p.model,
		"messages": []map[string]string{
			{"role": "user", "content": query},
		},
		"temperature": opts.Temperature,
		"max_tokens":  opts.MaxTokens,
	}
	bodyBytes, err := json.Marshal(reqBody)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(ctx, "POST", "https://api.perplexity.ai/chat/completions", bytes.NewReader(bodyBytes))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+p.apiKey)
	req.Header.Set("Content-Type", "application/json")

	if p.apiKey == "" {
		return nil, fmt.Errorf("PERPLEXITY_API_KEY is required in live mode")
	}
	resp, err := p.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("sampling transport failed: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("sampling provider returned HTTP %d", resp.StatusCode)
	}

	respData, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if err != nil {
		return nil, err
	}

	var parsed struct {
		Choices []struct {
			FinishReason string `json:"finish_reason"`
			Message      struct {
				Content string `json:"content"`
				Refusal string `json:"refusal"`
			} `json:"message"`
		} `json:"choices"`
		Citations []string `json:"citations"`
		Model     string   `json:"model"`
		Usage     struct {
			TotalTokens int `json:"total_tokens"`
		} `json:"usage"`
	}
	if err := json.Unmarshal(respData, &parsed); err != nil || len(parsed.Choices) == 0 {
		return nil, fmt.Errorf("sampling provider returned an invalid response")
	}

	content := parsed.Choices[0].Message.Content
	model := parsed.Model
	if model == "" {
		model = p.model
	}
	citations := make([]domain.ParsedCitation, 0, len(parsed.Citations))
	for _, c := range parsed.Citations {
		citations = append(citations, domain.ParsedCitation{
			URL:     c,
			Domain:  extractDomain(c),
			Snippet: "",
			IsOwned: false,
		})
	}

	return &domain.SamplingResult{
		Source:       "live",
		RawText:      content,
		Entities:     []domain.ParsedEntity{},
		Citations:    citations,
		IsRefusal:    parsed.Choices[0].Message.Refusal != "" || parsed.Choices[0].FinishReason == "content_filter",
		ModelVersion: model,
		Confidence:   0,
		TokensUsed:   parsed.Usage.TotalTokens,
	}, nil
}

func (p *PerplexityConnector) ValidateCredential(ctx context.Context, config map[string]string) error {
	if p.apiKey == "" {
		return fmt.Errorf("PERPLEXITY_API_KEY is not set")
	}
	return nil
}

func extractDomain(u string) string {
	parts := strings.Split(u, "/")
	if len(parts) >= 3 {
		return parts[2]
	}
	return u
}
