package usecase

import (
	"context"
	"github.com/google/uuid"
	"github.com/modelcontextprotocol/go-sdk/mcp"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestOfficialMCPHandshakeAndRealToolExecution(t *testing.T) {
	t.Setenv("APP_ENV", "development")
	t.Setenv("ALLOW_LOCAL_OUTBOUND", "true")
	server := mcp.NewServer(&mcp.Implementation{Name: "controlled", Version: "1"}, nil)
	type Input struct {
		Value string `json:"value"`
	}
	type Output struct {
		Echo string `json:"echo"`
	}
	mcp.AddTool(server, &mcp.Tool{Name: "echo", Description: "Echo provided input"}, func(ctx context.Context, req *mcp.CallToolRequest, in Input) (*mcp.CallToolResult, Output, error) {
		return &mcp.CallToolResult{Content: []mcp.Content{&mcp.TextContent{Text: "ACTUAL:" + in.Value}}}, Output{Echo: in.Value}, nil
	})
	handler := mcp.NewStreamableHTTPHandler(func(*http.Request) *mcp.Server { return server }, &mcp.StreamableHTTPOptions{Stateless: true})
	httpServer := httptest.NewServer(handler)
	defer httpServer.Close()
	client := NewMCPClient("server", httpServer.URL, nil)
	tools, err := client.ListTools(context.Background())
	if err != nil || len(tools) != 1 || tools[0].Name != "echo" {
		t.Fatalf("real MCP discovery failed: %+v %v", tools, err)
	}
	result, err := client.CallTool(context.Background(), "echo", map[string]interface{}{"value": "payload"})
	if err != nil || result != "ACTUAL:payload" {
		t.Fatalf("tool not executed: %s %v", result, err)
	}
	if _, err = client.CallTool(context.Background(), "unknown", map[string]interface{}{}); err == nil {
		t.Fatal("unknown tool reported success")
	}
	if err = validateToolArgs(tools[0].InputSchema, `{"value":123}`); err == nil {
		t.Fatal("invalid tool arguments accepted")
	}
	first, second := toolNamespace(uuid.New(), "echo"), toolNamespace(uuid.New(), "echo")
	if first == second || len(first) > 64 {
		t.Fatal("MCP tool names collide or exceed model limits")
	}
}
