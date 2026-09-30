package jwtutil

import (
	"testing"
	"time"

	"github.com/google/uuid"
)

func TestJWTService_GenerateAndValidateTokenPair(t *testing.T) {
	service := NewJWTService("test-access-secret-32-bytes-long!", "test-refresh-secret-32-bytes-long", time.Hour, 24*time.Hour)

	userID := uuid.New()
	orgID := uuid.New()
	email := "admin@bgeo.cc"
	role := "admin"

	accessToken, refreshToken, accessExp, refreshExp, err := service.GenerateTokenPair(userID, orgID, email, role)
	if err != nil {
		t.Fatalf("GenerateTokenPair failed: %v", err)
	}

	if accessToken == "" || refreshToken == "" {
		t.Fatalf("Expected non-empty tokens, got access=%s, refresh=%s", accessToken, refreshToken)
	}
	if accessExp <= time.Now().Unix() || refreshExp <= accessExp {
		t.Fatalf("Invalid expiration timestamps: accessExp=%d, refreshExp=%d", accessExp, refreshExp)
	}

	// 1. Validate Access Token
	accessClaims, err := service.ValidateAccessToken(accessToken)
	if err != nil {
		t.Fatalf("ValidateAccessToken failed: %v", err)
	}
	if accessClaims.UserID != userID || accessClaims.Email != email || accessClaims.Role != role {
		t.Errorf("Access claims mismatch: %+v", accessClaims)
	}

	// 2. Validate Refresh Token
	refreshClaims, err := service.ValidateRefreshToken(refreshToken)
	if err != nil {
		t.Fatalf("ValidateRefreshToken failed: %v", err)
	}
	if refreshClaims.UserID != userID || refreshClaims.Email != email {
		t.Errorf("Refresh claims mismatch: %+v", refreshClaims)
	}

	// 3. Cross-token validation should fail
	_, err = service.ValidateAccessToken(refreshToken)
	if err == nil {
		t.Error("Expected error validating refresh token with ValidateAccessToken, got nil")
	}

	_, err = service.ValidateRefreshToken(accessToken)
	if err == nil {
		t.Error("Expected error validating access token with ValidateRefreshToken, got nil")
	}

	// 4. Invalid token string
	_, err = service.ValidateAccessToken("invalid.jwt.token")
	if err == nil {
		t.Error("Expected error validating malformed token, got nil")
	}
}
