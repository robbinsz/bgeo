package http

import (
	"bytes"
	"encoding/json"
	"github.com/google/uuid"
	"github.com/robbinsz/bgeo/internal/repository"
	"github.com/robbinsz/bgeo/pkg/jwtutil"
	"golang.org/x/crypto/bcrypt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

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
