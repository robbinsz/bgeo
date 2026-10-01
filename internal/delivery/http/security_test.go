package http

import (
	"bytes"
	"encoding/json"
	"fmt"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/robbinsz/bgeo/internal/delivery/http/middleware"
	"github.com/robbinsz/bgeo/internal/delivery/ws"
	"github.com/robbinsz/bgeo/internal/repository"
	"github.com/robbinsz/bgeo/pkg/jwtutil"
	"golang.org/x/crypto/bcrypt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestOpenWebSocketStopsReceivingDataAfterSessionRevocation(t *testing.T) {
	router, db, token, projectID := setupTestRouter(t)
	hub := ws.GlobalHub
	defer hub.Close()
	server := httptest.NewServer(router)
	defer server.Close()
	headers := http.Header{"Authorization": []string{"Bearer " + token}, "X-Project-ID": []string{projectID.String()}}
	conn, _, err := websocket.DefaultDialer.Dial(strings.Replace(server.URL, "http://", "ws://", 1)+"/ws/live", headers)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	conn.SetReadDeadline(time.Now().Add(5 * time.Second))
	_, ack, err := conn.ReadMessage()
	if err != nil || !bytes.Contains(ack, []byte("SUBSCRIBED")) {
		t.Fatalf("subscription failed: %s %v", ack, err)
	}
	if err := db.Model(&repository.UserModel{}).Where("email = ?", "test@bgeo.cc").Update("auth_version", 1).Error; err != nil {
		t.Fatal(err)
	}
	hub.BroadcastProject(projectID, "PRIVATE_DATA", "project", map[string]string{"secret": "must not arrive"})
	if _, data, err := conn.ReadMessage(); err == nil {
		t.Fatalf("revoked socket received data: %s", data)
	}
}

func TestEveryProjectRouteHasAnExplicitPolicy(t *testing.T) {
	router, _, _, _ := setupTestRouter(t)
	for _, route := range router.Routes() {
		if route.Path == "/ws/live" || (strings.HasPrefix(route.Path, "/api/v1/") && !strings.HasPrefix(route.Path, "/api/v1/auth/") && route.Path != "/api/v1/projects" && route.Path != "/api/v1/health" && route.Path != "/api/v1/runtime") {
			if !middleware.HasProjectPolicy(route.Method, route.Path) {
				t.Errorf("missing policy: %s %s", route.Method, route.Path)
			}
		}
	}
	if middleware.HasProjectPolicy("POST", "/api/v1/future/publish") {
		t.Fatal("unknown route unexpectedly allowed")
	}
}

func TestPasswordChangeRevokesAccessAndRefreshCredentials(t *testing.T) {
	router, db, token, _ := setupTestRouter(t)
	hash, _ := bcrypt.GenerateFromPassword([]byte("correct-password"), bcrypt.MinCost)
	db.Model(&repository.UserModel{}).Where("email = ?", "test@bgeo.cc").Update("password_hash", string(hash))
	login := httptest.NewRequest("POST", "/api/v1/auth/login", bytes.NewBufferString(`{"email":"test@bgeo.cc","password":"correct-password"}`))
	login.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	router.ServeHTTP(response, login)
	if response.Code != 200 {
		t.Fatalf("login: %d %s", response.Code, response.Body)
	}
	oldRefresh := response.Result().Cookies()[0]
	change := httptest.NewRequest("PUT", "/api/v1/auth/profile", bytes.NewBufferString(`{"current_password":"correct-password","new_password":"new-correct-password"}`))
	change.Header.Set("Content-Type", "application/json")
	change.Header.Set("Authorization", "Bearer "+token)
	response = httptest.NewRecorder()
	router.ServeHTTP(response, change)
	if response.Code != 200 {
		t.Fatalf("password change: %d %s", response.Code, response.Body)
	}
	for _, path := range []string{"/api/v1/auth/me", "/api/v1/auth/refresh"} {
		method := "GET"
		if strings.HasSuffix(path, "refresh") {
			method = "POST"
		}
		req := httptest.NewRequest(method, path, nil)
		req.Header.Set("Authorization", "Bearer "+token)
		req.AddCookie(oldRefresh)
		out := httptest.NewRecorder()
		router.ServeHTTP(out, req)
		if out.Code != 401 {
			t.Fatalf("revoked credential still accepted: %s %d", path, out.Code)
		}
	}
}

func TestProjectResourceAndRoleAuthorization(t *testing.T) {
	router, db, token, projectID := setupTestRouter(t)
	foreign := repository.ProjectModel{OrganizationID: uuid.New(), Name: "Foreign", BrandName: "Other"}
	db.Create(&foreign)
	asset := repository.ContentAssetModel{ProjectID: foreign.ID, Title: "Private", Status: "pending_approval"}
	db.Create(&asset)
	request := func(method, path, credential, project string, body string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, path, bytes.NewBufferString(body))
		req.Header.Set("Authorization", "Bearer "+credential)
		req.Header.Set("X-Project-ID", project)
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)
		return w
	}
	if w := request("GET", "/api/v1/content/assets", token, foreign.ID.String(), ""); w.Code != 403 {
		t.Fatalf("cross tenant project: %d %s", w.Code, w.Body)
	}
	if w := request("POST", "/api/v1/content/assets/"+asset.ID.String()+"/approve", token, projectID.String(), `{"version":1}`); w.Code != 404 {
		t.Fatalf("foreign resource disclosed or modified: %d", w.Code)
	}
	viewer := repository.UserModel{OrganizationID: repository.DefaultOrgID, Email: "viewer@example.com", Role: "viewer", Status: "active"}
	db.Create(&viewer)
	db.Create(&repository.ProjectMemberModel{ProjectID: projectID, UserID: viewer.ID, Role: "viewer"})
	jwt := jwtutil.NewJWTService("", "", time.Hour, time.Hour)
	viewerToken, _, _, _, _ := jwt.GenerateTokenPair(viewer.ID, viewer.OrganizationID, viewer.Email, "admin")
	if w := request("GET", "/api/v1/content/assets", viewerToken, projectID.String(), ""); w.Code != 200 {
		t.Fatalf("member unable to read: %d", w.Code)
	}
	if w := request("POST", "/api/v1/monitor/queries", viewerToken, projectID.String(), `{"query_text":"write"}`); w.Code != 403 {
		t.Fatal("JWT role used instead of actual membership")
	}
	db.Model(&viewer).Update("status", "disabled")
	if w := request("GET", "/api/v1/content/assets", viewerToken, projectID.String(), ""); w.Code != 401 {
		t.Fatal("disabled account retained access")
	}
	w := httptest.NewRecorder()
	router.ServeHTTP(w, httptest.NewRequest("GET", "/ws/live", nil))
	if w.Code != 401 {
		t.Fatalf("anonymous websocket accepted: %d", w.Code)
	}
}
func TestRefreshCookieRotationAndSecretsAtRest(t *testing.T) {
	router, db, _, _ := setupTestRouter(t)
	hash, _ := bcrypt.GenerateFromPassword([]byte("correct-password"), bcrypt.MinCost)
	db.Model(&repository.UserModel{}).Where("email = ?", "test@bgeo.cc").Update("password_hash", string(hash))
	req := httptest.NewRequest("POST", "/api/v1/auth/login", bytes.NewBufferString(`{"email":"test@bgeo.cc","password":"correct-password"}`))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	if w.Code != 200 {
		t.Fatalf("login failed: %s", w.Body)
	}
	var body map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &body)
	if body["refresh_token"] != nil {
		t.Fatal("refresh credential exposed to JS")
	}
	cookies := w.Result().Cookies()
	if len(cookies) == 0 || !cookies[0].HttpOnly || cookies[0].SameSite != http.SameSiteStrictMode {
		t.Fatal("refresh cookie protections missing")
	}
	cookie := cookies[0]
	var stored repository.RefreshTokenModel
	db.First(&stored)
	if stored.Token == cookie.Value || len(stored.Token) != 64 {
		t.Fatal("refresh token stored as plaintext")
	}
	refresh := func() *httptest.ResponseRecorder {
		r := httptest.NewRequest("POST", "/api/v1/auth/refresh", nil)
		r.AddCookie(cookie)
		out := httptest.NewRecorder()
		router.ServeHTTP(out, r)
		return out
	}
	if out := refresh(); out.Code != 200 {
		t.Fatalf("rotation failed: %s", out.Body)
	}
	if out := refresh(); out.Code != 401 {
		t.Fatal("consumed refresh token replay accepted")
	}
}
func TestEmptyMetricsAndUploadBoundaries(t *testing.T) {
	router, _, token, _ := setupTestRouter(t)
	req := httptest.NewRequest("GET", "/api/v1/overview/metrics", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	var metrics map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &metrics)
	if metrics["voice_share"] != nil || metrics["avg_rank"] != nil {
		t.Fatalf("empty data manufactured metrics: %s", w.Body)
	}
}

func TestCollectionPaginationAndRuntimeStatusUsePersistedData(t *testing.T) {
	router, db, token, projectID := setupTestRouter(t)
	for i := 0; i < 4; i++ {
		if err := db.Create(&repository.StrategyModel{ProjectID: projectID, Title: fmt.Sprintf("Strategy %d", i), Status: "backlog"}).Error; err != nil {
			t.Fatal(err)
		}
	}
	get := func(path string) *httptest.ResponseRecorder {
		req := httptest.NewRequest("GET", path, nil)
		req.Header.Set("Authorization", "Bearer "+token)
		req.Header.Set("X-Project-ID", projectID.String())
		out := httptest.NewRecorder()
		router.ServeHTTP(out, req)
		return out
	}
	first := get("/api/v1/strategies?limit=2")
	var page struct {
		Items      []repository.StrategyModel `json:"items"`
		Pagination repository.Page            `json:"pagination"`
	}
	if err := json.Unmarshal(first.Body.Bytes(), &page); err != nil {
		t.Fatal(err)
	}
	if first.Code != 200 || len(page.Items) != 2 || !page.Pagination.HasMore {
		t.Fatalf("incorrect first page: %s", first.Body)
	}
	firstID := page.Items[0].ID
	second := get("/api/v1/strategies?limit=2&offset=2")
	json.Unmarshal(second.Body.Bytes(), &page)
	if len(page.Items) != 2 || page.Pagination.HasMore || page.Items[0].ID == firstID {
		t.Fatalf("incorrect second page: %s", second.Body)
	}
	if out := get("/api/v1/strategies?limit=100000"); out.Code != 400 {
		t.Fatal("unbounded page accepted")
	}
	status := get("/api/v1/system/status")
	var data map[string]interface{}
	json.Unmarshal(status.Body.Bytes(), &data)
	if status.Code != 200 || data["expired_leases"] != float64(0) || data["unknown_publications"] != float64(0) || data["jobs"] == nil {
		t.Fatalf("invalid empty runtime status: %s", status.Body)
	}
}

func TestOwnedSessionRemainsReadableAfterApproval(t *testing.T) {
	router, db, token, projectID := setupTestRouter(t)
	session := repository.CopilotSessionModel{ProjectID: projectID, UserID: uuid.MustParse("00000000-0000-0000-0000-000000000001"), Title: "Owned"}
	if err := db.Create(&session).Error; err != nil {
		t.Fatal(err)
	}
	request := func() *httptest.ResponseRecorder {
		req := httptest.NewRequest("GET", "/api/v1/copilot/sessions/"+session.ID.String(), nil)
		req.Header.Set("Authorization", "Bearer "+token)
		req.Header.Set("X-Project-ID", projectID.String())
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)
		return w
	}
	if w := request(); w.Code != 200 {
		t.Fatalf("owned session unreadable: %d %s", w.Code, w.Body)
	}
	cp := repository.CopilotCheckpointModel{SessionID: session.ID, ThreadID: session.ID.String(), Status: "queued"}
	if err := db.Create(&cp).Error; err != nil {
		t.Fatal(err)
	}
	if w := request(); w.Code != 200 {
		t.Fatalf("queued approval hidden from owner: %d %s", w.Code, w.Body)
	}
}

func TestConversationPrivacyAlsoCoversTracesAndToolInputs(t *testing.T) {
	router, db, ownerToken, projectID := setupTestRouter(t)
	ownerID := uuid.MustParse("00000000-0000-0000-0000-000000000001")
	session := repository.CopilotSessionModel{ProjectID: projectID, UserID: ownerID, Title: "Private session"}
	if err := db.Create(&session).Error; err != nil {
		t.Fatal(err)
	}
	trace := repository.AgentExecutionTraceModel{ProjectID: projectID, SessionID: session.ID, UserPrompt: "private prompt", TimelineJSON: "[]"}
	log := repository.CopilotAuditLogModel{ProjectID: projectID, UserID: ownerID, SessionID: session.ID, ToolName: "private_tool", InputPayload: "private arguments", ExecutionRisk: "direct", ExecutionStatus: "success"}
	if err := db.Create(&trace).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&log).Error; err != nil {
		t.Fatal(err)
	}
	viewer := repository.UserModel{OrganizationID: repository.DefaultOrgID, Email: "trace-viewer@example.test", Role: "viewer", Status: "active"}
	if err := db.Create(&viewer).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&repository.ProjectMemberModel{ProjectID: projectID, UserID: viewer.ID, Role: "viewer"}).Error; err != nil {
		t.Fatal(err)
	}
	jwt := jwtutil.NewJWTService("", "", time.Hour, time.Hour)
	viewerToken, _, _, _, _ := jwt.GenerateTokenPair(viewer.ID, viewer.OrganizationID, viewer.Email, "viewer")
	request := func(path, token string) *httptest.ResponseRecorder {
		req := httptest.NewRequest("GET", "/api/v1/copilot/"+path, nil)
		req.Header.Set("Authorization", "Bearer "+token)
		req.Header.Set("X-Project-ID", projectID.String())
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)
		return w
	}
	if w := request("traces/"+trace.ID.String(), viewerToken); w.Code != 404 {
		t.Fatalf("another member's conversation trace was disclosed: %d", w.Code)
	}
	for _, path := range []string{"traces", "traces?session_id=" + session.ID.String(), "audit-logs"} {
		w := request(path, viewerToken)
		if w.Code != 200 || bytes.Contains(w.Body.Bytes(), []byte("private")) {
			t.Fatalf("private conversation data in %s: %d %s", path, w.Code, w.Body)
		}
	}
	if w := request("traces/"+trace.ID.String(), ownerToken); w.Code != 200 {
		t.Fatalf("owner lost trace access: %d %s", w.Code, w.Body)
	}
}
