package repository

import (
	"github.com/robbinsz/bgeo/pkg/secretutil"
	"gorm.io/gorm"
	"strings"
)

func encryptCredential(value *string) error {
	if *value == "" || strings.HasPrefix(*value, "enc:v1:") {
		return nil
	}
	encrypted, err := secretutil.Seal(*value)
	if err == nil {
		*value = encrypted
	}
	return err
}
func decryptCredential(value *string) error {
	plain, err := secretutil.Open(*value)
	if err == nil {
		*value = plain
	}
	return err
}
func (m *AIConfigModel) BeforeSave(tx *gorm.DB) error  { return encryptCredential(&m.APIKey) }
func (m *AIConfigModel) AfterFind(tx *gorm.DB) error   { return decryptCredential(&m.APIKey) }
func (m *MCPServerModel) BeforeSave(tx *gorm.DB) error { return encryptCredential(&m.AuthHeaders) }
func (m *MCPServerModel) AfterFind(tx *gorm.DB) error {
	m.HasCredentials = m.AuthHeaders != ""
	return decryptCredential(&m.AuthHeaders)
}
func (m *PublishChannelModel) BeforeSave(tx *gorm.DB) error { return encryptCredential(&m.Credential) }
func (m *PublishChannelModel) AfterFind(tx *gorm.DB) error {
	m.HasCredential = m.Credential != ""
	return decryptCredential(&m.Credential)
}
