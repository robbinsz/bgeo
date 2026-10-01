package outbound

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"net/netip"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"
)

func ValidateURL(raw string) error {
	u, err := url.Parse(raw)
	if err != nil || u.Hostname() == "" || u.User != nil || u.Fragment != "" {
		return fmt.Errorf("invalid outbound URL")
	}
	if u.Scheme != "https" {
		if !(os.Getenv("APP_ENV") != "production" && os.Getenv("ALLOW_LOCAL_OUTBOUND") == "true" && u.Scheme == "http") {
			return fmt.Errorf("outbound URL must use HTTPS")
		}
	}
	return nil
}

var transports sync.Map

type transportKey struct {
	allowLocal bool
	timeout    time.Duration
}

// Pool connections only within the same outbound security policy.
func Client(timeout time.Duration) *http.Client {
	key := transportKey{os.Getenv("APP_ENV") != "production" && os.Getenv("ALLOW_LOCAL_OUTBOUND") == "true", timeout}
	pooled, ok := transports.Load(key)
	if !ok {
		candidate := newTransport(timeout, key.allowLocal)
		pooled, _ = transports.LoadOrStore(key, candidate)
	}
	return &http.Client{Transport: pooled.(*http.Transport), Timeout: timeout, CheckRedirect: func(req *http.Request, via []*http.Request) error {
		if len(via) >= 3 {
			return fmt.Errorf("too many redirects")
		}
		if err := ValidateURL(req.URL.String()); err != nil {
			return err
		}
		if len(via) > 0 && !strings.EqualFold(req.URL.Host, via[0].URL.Host) {
			return fmt.Errorf("cross-host redirects are disabled")
		}
		return nil
	}}
}

// Addresses are checked at dial time, including redirected requests, to resist DNS rebinding.
func newTransport(timeout time.Duration, allowLocal bool) *http.Transport {
	dialer := &net.Dialer{Timeout: 10 * time.Second, KeepAlive: 30 * time.Second}
	transport := &http.Transport{TLSHandshakeTimeout: 10 * time.Second, ResponseHeaderTimeout: timeout, MaxIdleConns: 64, IdleConnTimeout: 90 * time.Second}
	transport.DialContext = func(ctx context.Context, network, address string) (net.Conn, error) {
		host, port, err := net.SplitHostPort(address)
		if err != nil {
			return nil, err
		}
		ips, err := net.DefaultResolver.LookupIPAddr(ctx, host)
		if err != nil {
			return nil, err
		}
		if len(ips) == 0 {
			return nil, fmt.Errorf("outbound host resolved to no addresses")
		}
		for _, a := range ips {
			if !allowLocal && (!publicIP(a.IP)) {
				return nil, fmt.Errorf("outbound address is not public")
			}
		}
		for _, a := range ips {
			conn, e := dialer.DialContext(ctx, network, net.JoinHostPort(a.IP.String(), port))
			if e == nil {
				return conn, nil
			}
			err = e
		}
		return nil, err
	}
	return transport
}

func publicIP(ip net.IP) bool {
	if !ip.IsGlobalUnicast() || ip.IsPrivate() || ip.IsLoopback() || ip.IsLinkLocalUnicast() || ip.IsUnspecified() {
		return false
	}
	addr, ok := netip.AddrFromSlice(ip)
	if !ok {
		return false
	}
	addr = addr.Unmap()
	for _, raw := range []string{"0.0.0.0/8", "100.64.0.0/10", "192.0.0.0/24", "192.0.2.0/24", "198.18.0.0/15", "198.51.100.0/24", "203.0.113.0/24", "240.0.0.0/4", "2001:db8::/32", "2001::/32", "64:ff9b::/96", "64:ff9b:1::/48"} {
		if netip.MustParsePrefix(raw).Contains(addr) {
			return false
		}
	}
	return true
}
