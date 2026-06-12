package model

import "encoding/json"

type ExternalVbenUser struct {
	ID           int             `gorm:"column:id"`
	Username     string          `gorm:"column:username"`
	Password     string          `gorm:"column:password"`
	RealName     string          `gorm:"column:real_name"`
	Avatar       string          `gorm:"column:avatar"`
	Status       int             `gorm:"column:status"`
	RoleIDs      json.RawMessage `gorm:"column:role_ids"`
	IsSuperAdmin bool            `gorm:"column:is_super_admin"`
	HomePath     string          `gorm:"column:home_path"`
}

func (ExternalVbenUser) TableName() string {
	return "system_users"
}

type ExternalVbenRole struct {
	ID                     int    `gorm:"column:id"`
	Name                   string `gorm:"column:name"`
	Code                   string `gorm:"column:code"`
	Status                 int    `gorm:"column:status"`
	CanLoginInfiniteCanvas bool   `gorm:"column:can_login_infinite_canvas"`
}

func (ExternalVbenRole) TableName() string {
	return "system_roles"
}

type ExternalVbenLLMModel struct {
	ID         string `gorm:"column:id"`
	Name       string `gorm:"column:name"`
	Protocol   string `gorm:"column:protocol"`
	APIBaseURL string `gorm:"column:api_base_url"`
	APIKey     string `gorm:"column:api_key"`
	ModelName  string `gorm:"column:model_name"`
	Mode       string `gorm:"column:mode"`
	Enabled    bool   `gorm:"column:enabled"`
	IsDefault  bool   `gorm:"column:is_default"`
}

func (ExternalVbenLLMModel) TableName() string {
	return "llm_models"
}

type ExternalVbenLLMSyncResult struct {
	Channels          int      `json:"channels"`
	ChatModels        int      `json:"chatModels"`
	ImageModels       int      `json:"imageModels"`
	VideoModels       int      `json:"videoModels"`
	DefaultTextModel  string   `json:"defaultTextModel"`
	DefaultImageModel string   `json:"defaultImageModel"`
	Skipped           []string `json:"skipped"`
}
