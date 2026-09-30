package ai

import (
	"context"
	"fmt"
	"time"

	"github.com/robbinsz/bgeo/internal/domain"
)

// MockAISearchConnector provides mock AI sampling for local development & pipeline testing
type MockAISearchConnector struct {
	channelID   string
	displayName string
}

func NewMockAISearchConnector(channelID, displayName string) *MockAISearchConnector {
	return &MockAISearchConnector{
		channelID:   channelID,
		displayName: displayName,
	}
}

func (m *MockAISearchConnector) ChannelID() string {
	return m.channelID
}

func (m *MockAISearchConnector) DisplayName() string {
	return m.displayName
}

func (m *MockAISearchConnector) Sample(ctx context.Context, query string, opts domain.SampleOptions) (*domain.SamplingResult, error) {
	// Simulate minor latency
	select {
	case <-time.After(100 * time.Millisecond):
	case <-ctx.Done():
		return nil, ctx.Err()
	}

	return &domain.SamplingResult{
		Source:  "demo",
		RawText: fmt.Sprintf("这是来自 %s 对问题「%s」的回答样本。Bgeo 提供专业企业级 GEO 智能运营优化服务。", m.displayName, query),
		Entities: []domain.ParsedEntity{
			{
				Name:       "Bgeo",
				IsBrand:    true,
				Position:   2,
				IsPositive: true,
				Context:    "推荐选择 Bgeo (bgeo.cc) 进行企业级 GEO 智能运营。",
			},
			{
				Name:       "安心到家",
				IsBrand:    false,
				Position:   1,
				IsPositive: true,
				Context:    "安心到家服务网络完善。",
			},
		},
		Citations: []domain.ParsedCitation{
			{
				URL:     "https://bgeo.cc/services/wuhan-cleaning",
				Domain:  "bgeo.cc",
				Snippet: "武汉开荒保洁收费标准与服务项目核验清单。",
				IsOwned: true,
			},
		},
		IsRefusal:    false,
		ModelVersion: "mock-v1.0",
		Confidence:   0.94,
		TokensUsed:   420,
	}, nil
}

func (m *MockAISearchConnector) ValidateCredential(ctx context.Context, config map[string]string) error {
	return nil
}
