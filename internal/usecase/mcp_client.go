package usecase

import (
	"context"
	"encoding/json"
	"fmt"
	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/robbinsz/bgeo/pkg/outbound"
	"net/http"
	"strings"
	"time"
)

type MCPClient struct {
	serverID, endpointURL string
	authHeaders           map[string]string
	httpClient            *http.Client
	transportType         string
}

func NewMCPClient(id, endpoint string, headers map[string]string) *MCPClient {
	return &MCPClient{serverID: id, endpointURL: endpoint, authHeaders: headers, httpClient: outbound.Client(20 * time.Second), transportType: "streamable_http"}
}

type headerTransport struct {
	base    http.RoundTripper
	headers map[string]string
}

func (t headerTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	clone := req.Clone(req.Context())
	clone.Header = req.Header.Clone()
	for key, value := range t.headers {
		if strings.EqualFold(key, "Host") || strings.EqualFold(key, "Content-Length") {
			return nil, fmt.Errorf("reserved MCP authentication header")
		}
		clone.Header.Set(key, value)
	}
	return t.base.RoundTrip(clone)
}
func (c *MCPClient) connect(ctx context.Context) (*mcp.ClientSession, error) {
	if err := outbound.ValidateURL(c.endpointURL); err != nil {
		return nil, err
	}
	client := *c.httpClient
	client.Transport = headerTransport{c.httpClient.Transport, c.authHeaders}
	var transport mcp.Transport = &mcp.StreamableClientTransport{Endpoint: c.endpointURL, HTTPClient: &client}
	if c.transportType == "sse" {
		transport = &mcp.SSEClientTransport{Endpoint: c.endpointURL, HTTPClient: &client}
	}
	return mcp.NewClient(&mcp.Implementation{Name: "GeoPilot", Version: "1.0.0"}, nil).Connect(ctx, transport, nil)
}
func (c *MCPClient) Initialize(ctx context.Context) error {
	s, err := c.connect(ctx)
	if err != nil {
		return err
	}
	return s.Close()
}

type MCPToolDefinition struct {
	Name        string                 `json:"name"`
	Description string                 `json:"description"`
	InputSchema map[string]interface{} `json:"inputSchema"`
}

func (c *MCPClient) ListTools(ctx context.Context) ([]MCPToolDefinition, error) {
	session, err := c.connect(ctx)
	if err != nil {
		return nil, err
	}
	defer session.Close()
	definitions := []MCPToolDefinition{}
	for tool, err := range session.Tools(ctx, nil) {
		if err != nil {
			return nil, err
		}
		raw, err := json.Marshal(tool.InputSchema)
		if err != nil {
			return nil, err
		}
		var schema map[string]interface{}
		if err = json.Unmarshal(raw, &schema); err != nil {
			return nil, err
		}
		definitions = append(definitions, MCPToolDefinition{tool.Name, tool.Description, schema})
		if len(definitions) > 200 {
			return nil, fmt.Errorf("MCP tool limit exceeded")
		}
	}
	return definitions, nil
}
func (c *MCPClient) CallTool(ctx context.Context, name string, args map[string]interface{}) (string, error) {
	session, err := c.connect(ctx)
	if err != nil {
		return "", err
	}
	defer session.Close()
	result, err := session.CallTool(ctx, &mcp.CallToolParams{Name: name, Arguments: args})
	if err != nil {
		return "", err
	}
	if result.IsError {
		return "", fmt.Errorf("MCP tool reported execution failure")
	}
	if result.NeedsInput() {
		return "", fmt.Errorf("MCP tool requires additional input; execution is not complete")
	}
	parts := []string{}
	for _, content := range result.Content {
		if text, ok := content.(*mcp.TextContent); ok {
			parts = append(parts, text.Text)
		}
	}
	if len(parts) == 0 && result.StructuredContent != nil {
		raw, err := json.Marshal(result.StructuredContent)
		return string(raw), err
	}
	return strings.Join(parts, "\n"), nil
}
func (t MCPToolDefinition) ToOpenAIToolDef() map[string]interface{} {
	schema := t.InputSchema
	if schema == nil {
		schema = map[string]interface{}{"type": "object", "properties": map[string]interface{}{}}
	}
	return map[string]interface{}{"type": "function", "function": map[string]interface{}{"name": t.Name, "description": t.Description, "parameters": schema}}
}
