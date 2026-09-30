package secretutil

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"os"
	"strings"
	"sync"
)

var once sync.Once
var developmentKey []byte

func aead() (cipher.AEAD, error) {
	var key []byte
	if raw := os.Getenv("CREDENTIAL_ENCRYPTION_KEY"); raw != "" {
		var err error
		key, err = base64.StdEncoding.DecodeString(raw)
		if err != nil || len(key) != 32 {
			return nil, fmt.Errorf("invalid credential encryption key")
		}
	} else {
		if os.Getenv("APP_ENV") == "production" {
			return nil, fmt.Errorf("credential encryption key is required")
		}
		once.Do(func() {
			developmentKey = make([]byte, 32)
			if _, err := rand.Read(developmentKey); err != nil {
				panic(err)
			}
		})
		key = developmentKey
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	return cipher.NewGCM(block)
}
func Seal(value string) (string, error) {
	if value == "" {
		return "", nil
	}
	a, err := aead()
	if err != nil {
		return "", err
	}
	n := make([]byte, a.NonceSize())
	if _, err = rand.Read(n); err != nil {
		return "", err
	}
	return "enc:v1:" + base64.StdEncoding.EncodeToString(a.Seal(n, n, []byte(value), nil)), nil
}
func Open(value string) (string, error) {
	if value == "" {
		return "", nil
	}
	if !strings.HasPrefix(value, "enc:v1:") {
		if os.Getenv("APP_ENV") == "production" {
			return "", fmt.Errorf("unencrypted credential must be migrated before production use")
		}
		return value, nil
	}
	a, err := aead()
	if err != nil {
		return "", err
	}
	b, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(value, "enc:v1:"))
	if err != nil || len(b) < a.NonceSize() {
		return "", fmt.Errorf("invalid encrypted credential")
	}
	p, err := a.Open(nil, b[:a.NonceSize()], b[a.NonceSize():], nil)
	return string(p), err
}
func Digest(value string) string { s := sha256.Sum256([]byte(value)); return hex.EncodeToString(s[:]) }
