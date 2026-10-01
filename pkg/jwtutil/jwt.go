package jwtutil

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

// Empty secrets are ephemeral development keys, shared only within this process.
// Production configuration rejects empty keys before creating the JWT service.
var ephemeralAccessSecret = randomSecret()
var ephemeralRefreshSecret = randomSecret()

func randomSecret() string {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	return hex.EncodeToString(b)
}

var (
	ErrInvalidToken   = errors.New("invalid or expired token")
	ErrWrongTokenType = errors.New("unexpected token type")
)

type CustomClaims struct {
	UserID      uuid.UUID `json:"user_id"`
	OrgID       uuid.UUID `json:"org_id"`
	Email       string    `json:"email"`
	Role        string    `json:"role"`
	TokenType   string    `json:"token_type"` // "access" or "refresh"
	AuthVersion int       `json:"auth_version"`
	jwt.RegisteredClaims
}

type JWTService struct {
	accessSecret  []byte
	refreshSecret []byte
	accessTTL     time.Duration
	refreshTTL    time.Duration
	issuer        string
}

func NewJWTService(accessSecret, refreshSecret string, accessTTL, refreshTTL time.Duration) *JWTService {
	if accessSecret == "" {
		accessSecret = ephemeralAccessSecret
	}
	if refreshSecret == "" {
		refreshSecret = ephemeralRefreshSecret
	}
	if accessTTL <= 0 {
		accessTTL = 2 * time.Hour
	}
	if refreshTTL <= 0 {
		refreshTTL = 7 * 24 * time.Hour
	}

	return &JWTService{
		accessSecret:  []byte(accessSecret),
		refreshSecret: []byte(refreshSecret),
		accessTTL:     accessTTL,
		refreshTTL:    refreshTTL,
		issuer:        "bgeo.cc",
	}
}

// GenerateTokenPair generates both an access token and a refresh token for dual-token auth
func (s *JWTService) GenerateTokenPair(userID, orgID uuid.UUID, email, role string) (accessToken, refreshToken string, accessExp, refreshExp int64, err error) {
	return s.GenerateTokenPairWithVersion(userID, orgID, email, role, 0)
}

func (s *JWTService) GenerateTokenPairWithVersion(userID, orgID uuid.UUID, email, role string, authVersion int) (accessToken, refreshToken string, accessExp, refreshExp int64, err error) {
	now := time.Now()

	// 1. Access Token (Short-lived)
	accessExpiration := now.Add(s.accessTTL)
	accessClaims := &CustomClaims{
		UserID:      userID,
		OrgID:       orgID,
		Email:       email,
		Role:        role,
		TokenType:   "access",
		AuthVersion: authVersion,
		RegisteredClaims: jwt.RegisteredClaims{
			ID:        uuid.NewString(),
			ExpiresAt: jwt.NewNumericDate(accessExpiration),
			IssuedAt:  jwt.NewNumericDate(now),
			NotBefore: jwt.NewNumericDate(now),
			Issuer:    s.issuer,
			Subject:   userID.String(),
		},
	}
	accessTokenObj := jwt.NewWithClaims(jwt.SigningMethodHS256, accessClaims)
	accessToken, err = accessTokenObj.SignedString(s.accessSecret)
	if err != nil {
		return "", "", 0, 0, fmt.Errorf("failed to sign access token: %w", err)
	}

	// 2. Refresh Token (Long-lived)
	refreshExpiration := now.Add(s.refreshTTL)
	refreshClaims := &CustomClaims{
		UserID:      userID,
		OrgID:       orgID,
		Email:       email,
		Role:        role,
		TokenType:   "refresh",
		AuthVersion: authVersion,
		RegisteredClaims: jwt.RegisteredClaims{
			ID:        uuid.NewString(),
			ExpiresAt: jwt.NewNumericDate(refreshExpiration),
			IssuedAt:  jwt.NewNumericDate(now),
			NotBefore: jwt.NewNumericDate(now),
			Issuer:    s.issuer,
			Subject:   userID.String(),
		},
	}
	refreshTokenObj := jwt.NewWithClaims(jwt.SigningMethodHS256, refreshClaims)
	refreshToken, err = refreshTokenObj.SignedString(s.refreshSecret)
	if err != nil {
		return "", "", 0, 0, fmt.Errorf("failed to sign refresh token: %w", err)
	}

	return accessToken, refreshToken, accessExpiration.Unix(), refreshExpiration.Unix(), nil
}

// ValidateAccessToken parses and validates an access token
func (s *JWTService) ValidateAccessToken(tokenString string) (*CustomClaims, error) {
	token, err := jwt.ParseWithClaims(tokenString, &CustomClaims{}, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
		}
		return s.accessSecret, nil
	}, jwt.WithValidMethods([]string{"HS256"}), jwt.WithIssuer(s.issuer), jwt.WithExpirationRequired())
	if err != nil {
		return nil, ErrInvalidToken
	}

	claims, ok := token.Claims.(*CustomClaims)
	if !ok || !token.Valid {
		return nil, ErrInvalidToken
	}
	if claims.TokenType != "access" {
		return nil, ErrWrongTokenType
	}

	return claims, nil
}

// ValidateRefreshToken parses and validates a refresh token
func (s *JWTService) ValidateRefreshToken(tokenString string) (*CustomClaims, error) {
	token, err := jwt.ParseWithClaims(tokenString, &CustomClaims{}, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
		}
		return s.refreshSecret, nil
	}, jwt.WithValidMethods([]string{"HS256"}), jwt.WithIssuer(s.issuer), jwt.WithExpirationRequired())
	if err != nil {
		return nil, ErrInvalidToken
	}

	claims, ok := token.Claims.(*CustomClaims)
	if !ok || !token.Valid {
		return nil, ErrInvalidToken
	}
	if claims.TokenType != "refresh" {
		return nil, ErrWrongTokenType
	}

	return claims, nil
}
