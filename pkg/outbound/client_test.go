package outbound

import (
	"net"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestReservedAddressesAndCredentialsInURLsRejected(t *testing.T) {
	for _, ip := range []string{"127.0.0.1", "10.0.0.1", "100.64.0.1", "169.254.169.254", "198.18.0.1", "::1", "::ffff:127.0.0.1", "64:ff9b::7f00:1", "2001:db8::1"} {
		if publicIP(net.ParseIP(ip)) {
			t.Fatalf("reserved address accepted: %s", ip)
		}
	}
	t.Setenv("APP_ENV", "production")
	for _, url := range []string{"http://example.com", "https://secret@example.com", "https://example.com/#fragment"} {
		if ValidateURL(url) == nil {
			t.Fatal("unsafe URL accepted")
		}
	}
}
func TestPrivateDialAndCrossHostRedirectBlocked(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(200) }))
	defer server.Close()
	t.Setenv("APP_ENV", "production")
	t.Setenv("ALLOW_LOCAL_OUTBOUND", "true")
	if _, err := Client(time.Second).Get(server.URL); err == nil {
		t.Fatal("production local outbound override bypassed address check")
	}
	t.Setenv("APP_ENV", "development")
	client := Client(time.Second)
	req, _ := http.NewRequest("GET", "https://other.example/path", nil)
	original, _ := http.NewRequest("GET", "https://receiver.example/path", nil)
	if err := client.CheckRedirect(req, []*http.Request{original}); err == nil {
		t.Fatal("credential-bearing cross host redirect accepted")
	}
}
