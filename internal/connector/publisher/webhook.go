package publisher

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/robbinsz/bgeo/internal/domain"
	"github.com/robbinsz/bgeo/pkg/outbound"
	"io"
	"net/http"
	"time"
)

var ErrOutcomeUnknown = errors.New("external publication outcome is unknown; reconcile before retrying")

type Webhook struct{}

func (Webhook) ChannelType() string { return "webhook" }
func (Webhook) Publish(ctx context.Context, payload *domain.PublishPayload, target map[string]string) (*domain.PublishReceipt, error) {
	if err := outbound.ValidateURL(target["endpoint"]); err != nil {
		return nil, err
	}
	raw, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, target["endpoint"], bytes.NewReader(raw))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Idempotency-Key", target["idempotency_key"])
	if target["credential"] != "" {
		req.Header.Set("Authorization", "Bearer "+target["credential"])
	}
	resp, err := outbound.Client(45 * time.Second).Do(req)
	if err != nil {
		return nil, fmt.Errorf("%w: transport error", ErrOutcomeUnknown)
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 500 {
		return nil, fmt.Errorf("%w: HTTP %d", ErrOutcomeUnknown, resp.StatusCode)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("publish rejected with HTTP %d", resp.StatusCode)
	}
	var receipt domain.PublishReceipt
	if err = json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(&receipt); err != nil || receipt.ExternalID == "" || receipt.PublishedURL == "" {
		return nil, ErrOutcomeUnknown
	}
	if err = outbound.ValidateURL(receipt.PublishedURL); err != nil {
		return nil, ErrOutcomeUnknown
	}
	return &receipt, nil
}
func (Webhook) Unpublish(ctx context.Context, receipt *domain.PublishReceipt) error {
	return fmt.Errorf("unpublish requires a separately approved channel operation")
}

func (Webhook) Reconcile(ctx context.Context, endpoint, key, credential string) (*domain.PublishReceipt, error) {
	if err := outbound.ValidateURL(endpoint); err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Idempotency-Key", key)
	if credential != "" {
		req.Header.Set("Authorization", "Bearer "+credential)
	}
	resp, err := outbound.Client(20 * time.Second).Do(req)
	if err != nil {
		return nil, ErrOutcomeUnknown
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return nil, ErrOutcomeUnknown
	}
	var receipt domain.PublishReceipt
	if err = json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(&receipt); err != nil || receipt.ExternalID == "" || receipt.PublishedURL == "" {
		return nil, ErrOutcomeUnknown
	}
	if err = outbound.ValidateURL(receipt.PublishedURL); err != nil {
		return nil, ErrOutcomeUnknown
	}
	return &receipt, nil
}
