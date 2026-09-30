package ai

import (
	"context"
	"github.com/robbinsz/bgeo/internal/domain"
	"io"
	"net/http"
	"strings"
	"testing"
)

func TestLiveMissingCredentialNeverReturnsDemo(t *testing.T) {
	t.Setenv("APP_MODE", "live")
	t.Setenv("PERPLEXITY_API_KEY", "")
	result, err := NewPerplexityConnector().Sample(context.Background(), "prompt", domain.SampleOptions{})
	if err == nil || result != nil {
		t.Fatal("missing credentials manufactured sampling success")
	}
	t.Setenv("APP_MODE", "demo")
	t.Setenv("APP_ENV", "development")
	result, err = NewPerplexityConnector().Sample(context.Background(), "prompt", domain.SampleOptions{})
	if err != nil || result.Source != "demo" {
		t.Fatal("explicit demo must be visibly tagged")
	}
}

type responseTransport func(*http.Request) (*http.Response, error)

func (f responseTransport) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }
func TestProviderRefusalIsPreserved(t *testing.T) {
	p := &PerplexityConnector{apiKey: "test-only", model: "test", httpClient: &http.Client{Transport: responseTransport(func(r *http.Request) (*http.Response, error) {
		return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(`{"choices":[{"message":{"content":"Cannot answer","refusal":"Declined"},"finish_reason":"stop"}],"model":"actual-provider-model"}`)), Header: make(http.Header)}, nil
	})}}
	result, err := p.Sample(context.Background(), "question", domain.SampleOptions{MaxTokens: 128})
	if err != nil || !result.IsRefusal || result.Source != "live" || result.ModelVersion != "actual-provider-model" {
		t.Fatal("provider refusal or provenance was lost", result, err)
	}
}
