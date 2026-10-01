package http

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestLoginRateLimitUsesTrustedProxyClientWithoutAcceptingSpoofedHeaders(t *testing.T) {
	for _, test := range []struct {
		name, proxies, remote string
		independentClients    bool
	}{
		{"trusted gateway keeps client limits separate", "172.16.0.0/12", "172.19.0.2:4567", true},
		{"public peers cannot spoof forwarding headers", "172.16.0.0/12", "198.51.100.10:4567", false},
		{"private peers are untrusted by default", "", "172.19.0.2:4567", false},
	} {
		t.Run(test.name, func(t *testing.T) {
			t.Setenv("TRUSTED_PROXIES", test.proxies)
			router, _, _, _ := setupTestRouter(t)
			for attempt := 0; attempt < 12; attempt++ {
				req := httptest.NewRequest("POST", "/api/v1/auth/login", strings.NewReader(`{"email":"absent@bgeo.cc","password":"incorrect-password"}`))
				req.RemoteAddr = test.remote
				req.Header.Set("Content-Type", "application/json")
				client := attempt + 1
				if test.independentClients {
					client = attempt/6 + 1
				}
				req.Header.Set("X-Forwarded-For", fmt.Sprintf("203.0.113.%d", client))
				req.Header.Set("X-Real-IP", fmt.Sprintf("203.0.113.%d", client))
				response := httptest.NewRecorder()
				router.ServeHTTP(response, req)
				want := http.StatusUnauthorized
				if !test.independentClients && attempt >= 10 {
					want = http.StatusTooManyRequests
				}
				if response.Code != want {
					t.Fatalf("login %d returned %d, want %d", attempt+1, response.Code, want)
				}
			}
		})
	}
}
