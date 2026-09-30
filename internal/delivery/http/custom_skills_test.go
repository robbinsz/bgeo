package http

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"fmt"
	"github.com/robbinsz/bgeo/internal/testutil"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/robbinsz/bgeo/internal/delivery/ws"
	"github.com/robbinsz/bgeo/internal/repository"
	"github.com/robbinsz/bgeo/pkg/jwtutil"

	"gorm.io/gorm"
)

func setupTestRouter(t *testing.T) (*gin.Engine, *gorm.DB, string, uuid.UUID) {
	t.Setenv("APP_MODE", "demo")
	t.Setenv("APP_ENV", "development")
	t.Setenv("COPILOT_API_KEY", "")
	gin.SetMode(gin.TestMode)
	db := testutil.Database(t)
	userID := uuid.MustParse("00000000-0000-0000-0000-000000000001")
	projID := repository.DefaultProjectID

	// Create test user and project
	user := &repository.UserModel{
		BaseGormModel:  repository.BaseGormModel{ID: userID},
		OrganizationID: repository.DefaultOrgID,
		Email:          "test@bgeo.cc",
		Name:           "Test Admin",
		Role:           "admin",
		Status:         "active",
	}
	db.Create(user)

	proj := &repository.ProjectModel{
		BaseGormModel:  repository.BaseGormModel{ID: projID},
		OrganizationID: repository.DefaultOrgID,
		Name:           "Test Project",
		BrandName:      "Bgeo",
	}
	db.Create(proj)

	jwtService := jwtutil.NewJWTService("", "", 2*time.Hour, 7*24*time.Hour)
	token, _, _, _, err := jwtService.GenerateTokenPair(userID, repository.DefaultOrgID, "test@bgeo.cc", "admin")
	if err != nil {
		t.Fatalf("failed to generate token: %v", err)
	}

	hub := ws.InitGlobalHub()
	t.Cleanup(hub.Close)

	router := SetupRouterWithDB(db, hub)
	return router, db, token, projID
}

func createTestZip(t *testing.T, files map[string]string) []byte {
	buf := new(bytes.Buffer)
	zw := zip.NewWriter(buf)

	for name, content := range files {
		f, err := zw.Create(name)
		if err != nil {
			t.Fatalf("failed to create file in zip: %v", err)
		}
		if _, err := f.Write([]byte(content)); err != nil {
			t.Fatalf("failed to write content in zip: %v", err)
		}
	}

	if err := zw.Close(); err != nil {
		t.Fatalf("failed to close zip: %v", err)
	}

	return buf.Bytes()
}

func makeMultipartUploadRequest(t *testing.T, router *gin.Engine, token string, projID uuid.UUID, filename string, fileBytes []byte) *httptest.ResponseRecorder {
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)

	part, err := writer.CreateFormFile("file", filename)
	if err != nil {
		t.Fatalf("failed to create form file: %v", err)
	}
	if _, err := io.Copy(part, bytes.NewReader(fileBytes)); err != nil {
		t.Fatalf("failed to copy file bytes: %v", err)
	}
	writer.Close()

	req, _ := http.NewRequest("POST", "/api/v1/harness/skills/import", body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("X-Project-ID", projID.String())

	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	return w
}

func TestCustomSkillImportScreening(t *testing.T) {
	router, _, token, projID := setupTestRouter(t)

	// Case 1: Upload a zip without SKILL.md -> preliminary screening MUST fail
	invalidZip := createTestZip(t, map[string]string{
		"README.md":   "# My Skill\nSome info",
		"config.json": `{"version": "1.0"}`,
	})

	w1 := makeMultipartUploadRequest(t, router, token, projID, "bad-skill.zip", invalidZip)
	if w1.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 Bad Request for zip without SKILL.md, got %d. Body: %s", w1.Code, w1.Body.String())
	}
	if !bytes.Contains(w1.Body.Bytes(), []byte("压缩包初步筛查未通过")) {
		t.Errorf("expected response to state preliminary screening failure, got: %s", w1.Body.String())
	}

	// Case 2: Upload a zip with empty SKILL.md -> screening MUST fail
	emptySkillZip := createTestZip(t, map[string]string{
		"SKILL.md": "   \n\n  ",
	})
	w2 := makeMultipartUploadRequest(t, router, token, projID, "empty-skill.zip", emptySkillZip)
	if w2.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 Bad Request for empty SKILL.md, got %d. Body: %s", w2.Code, w2.Body.String())
	}

	// Case 3: Upload a non-zip file -> rejected
	w3 := makeMultipartUploadRequest(t, router, token, projID, "invalid.txt", []byte("plain text"))
	if w3.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 Bad Request for non-zip, got %d. Body: %s", w3.Code, w3.Body.String())
	}

	// Case 4: Upload valid zip with YAML frontmatter in SKILL.md
	validSkillMD := `---
name: Web Researcher Skill
description: Deep web research and citation verification
---
# Web Researcher
Instructions: Use this skill to perform web research.
`
	validZip := createTestZip(t, map[string]string{
		"SKILL.md":           validSkillMD,
		"prompts/system.txt": "Be concise and cite sources.",
	})

	w4 := makeMultipartUploadRequest(t, router, token, projID, "web-researcher.zip", validZip)
	if w4.Code != http.StatusCreated {
		t.Fatalf("expected 201 Created for valid zip, got %d. Body: %s", w4.Code, w4.Body.String())
	}

	var res4 struct {
		Status string                       `json:"status"`
		Skill  *repository.CustomSkillModel `json:"skill"`
	}
	if err := json.Unmarshal(w4.Body.Bytes(), &res4); err != nil {
		t.Fatalf("failed to unmarshal import response: %v", err)
	}
	if res4.Skill == nil {
		t.Fatalf("expected skill in response, got nil")
	}
	if res4.Skill.Name != "Web Researcher Skill" {
		t.Errorf("expected skill name 'Web Researcher Skill', got '%s'", res4.Skill.Name)
	}
	if res4.Skill.Description != "Deep web research and citation verification" {
		t.Errorf("expected skill description 'Deep web research and citation verification', got '%s'", res4.Skill.Description)
	}
	if res4.Skill.IsActive {
		t.Errorf("imported skill must be inactive until reviewed")
	}

	skillID := res4.Skill.ID

	// Case 5: List custom skills via GET /api/v1/harness/skills
	reqList, _ := http.NewRequest("GET", "/api/v1/harness/skills", nil)
	reqList.Header.Set("Authorization", "Bearer "+token)
	reqList.Header.Set("X-Project-ID", projID.String())
	wList := httptest.NewRecorder()
	router.ServeHTTP(wList, reqList)

	if wList.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for list skills, got %d. Body: %s", wList.Code, wList.Body.String())
	}
	var listRes struct {
		Items []repository.CustomSkillModel `json:"items"`
	}
	_ = json.Unmarshal(wList.Body.Bytes(), &listRes)
	if len(listRes.Items) != 1 {
		t.Fatalf("expected 1 custom skill in list, got %d", len(listRes.Items))
	}

	// Case 6: Toggle skill via PUT /api/v1/harness/skills/:id/toggle
	reqToggle, _ := http.NewRequest("PUT", fmt.Sprintf("/api/v1/harness/skills/%s/toggle", skillID), nil)
	reqToggle.Header.Set("Authorization", "Bearer "+token)
	reqToggle.Header.Set("X-Project-ID", projID.String())
	wToggle := httptest.NewRecorder()
	router.ServeHTTP(wToggle, reqToggle)

	if wToggle.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for toggle skill, got %d. Body: %s", wToggle.Code, wToggle.Body.String())
	}
	var toggleRes struct {
		Status   string `json:"status"`
		IsActive bool   `json:"is_active"`
	}
	_ = json.Unmarshal(wToggle.Body.Bytes(), &toggleRes)
	if !toggleRes.IsActive {
		t.Errorf("expected skill to be activated by explicit toggle, got %v", toggleRes.IsActive)
	}

	// Case 7: Delete skill via DELETE /api/v1/harness/skills/:id
	reqDel, _ := http.NewRequest("DELETE", fmt.Sprintf("/api/v1/harness/skills/%s", skillID), nil)
	reqDel.Header.Set("Authorization", "Bearer "+token)
	reqDel.Header.Set("X-Project-ID", projID.String())
	wDel := httptest.NewRecorder()
	router.ServeHTTP(wDel, reqDel)

	if wDel.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for delete skill, got %d. Body: %s", wDel.Code, wDel.Body.String())
	}

	// Verify list is now empty
	wListAfter := httptest.NewRecorder()
	router.ServeHTTP(wListAfter, reqList)
	var listAfterRes struct {
		Items []repository.CustomSkillModel `json:"items"`
	}
	_ = json.Unmarshal(wListAfter.Body.Bytes(), &listAfterRes)
	if len(listAfterRes.Items) != 0 {
		t.Fatalf("expected 0 custom skills after deletion, got %d", len(listAfterRes.Items))
	}
}

func TestMemoryTriggerHookEndpoint(t *testing.T) {
	router, _, token, projID := setupTestRouter(t)

	// Call POST /api/v1/harness/memory/trigger-hook
	reqBody := map[string]string{
		"user_prompt":    "请记住：以后在知乎回答里不要用夸张语气，多列举真实施工资质和面积透明价格",
		"assistant_resp": "好的，我已经记下您的运营要求。后续在知乎内容创作中将重点突出真实施工资质与透明面积价格。",
	}
	bodyBytes, _ := json.Marshal(reqBody)

	req, _ := http.NewRequest("POST", "/api/v1/harness/memory/trigger-hook", bytes.NewReader(bodyBytes))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("X-Project-ID", projID.String())

	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 OK from memory trigger-hook, got %d. Body: %s", w.Code, w.Body.String())
	}

	var res struct {
		Status    string                        `json:"status"`
		Count     int                           `json:"count"`
		Extracted []repository.MemoryEntryModel `json:"extracted"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &res); err != nil {
		t.Fatalf("failed to unmarshal trigger-hook response: %v", err)
	}
	if res.Count == 0 || len(res.Extracted) == 0 {
		t.Fatalf("expected extracted memory items from hook, got 0")
	}
	if res.Extracted[0].MemoryType != "user_pref" {
		t.Errorf("expected memory_type 'user_pref', got '%s'", res.Extracted[0].MemoryType)
	}
	if res.Extracted[0].ExtractionSource != "agent_hook" {
		t.Errorf("expected extraction_source 'agent_hook', got '%s'", res.Extracted[0].ExtractionSource)
	}

	// Verify listing memory entries contains this hook-extracted memory
	reqGet, _ := http.NewRequest("GET", "/api/v1/harness/memory", nil)
	reqGet.Header.Set("Authorization", "Bearer "+token)
	reqGet.Header.Set("X-Project-ID", projID.String())
	wGet := httptest.NewRecorder()
	router.ServeHTTP(wGet, reqGet)

	if wGet.Code != http.StatusOK {
		t.Fatalf("expected 200 OK from GET /harness/memory, got %d", wGet.Code)
	}
	var getRes struct {
		Items []repository.MemoryEntryModel `json:"items"`
	}
	_ = json.Unmarshal(wGet.Body.Bytes(), &getRes)
	if len(getRes.Items) != 1 {
		t.Fatalf("expected 1 memory item, got %d", len(getRes.Items))
	}
	if getRes.Items[0].ExtractionSource != "agent_hook" {
		t.Errorf("expected item extraction_source 'agent_hook', got '%s'", getRes.Items[0].ExtractionSource)
	}
}
