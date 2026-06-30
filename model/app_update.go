package model

import "time"

type ExternalAppUpdate struct {
	ID            int64      `gorm:"column:id" json:"id"`
	Version       string     `gorm:"column:version" json:"version"`
	Title         string     `gorm:"column:title" json:"title"`
	ReleaseNotes  string     `gorm:"column:release_notes" json:"releaseNotes"`
	Platform      string     `gorm:"column:platform" json:"platform"`
	Arch          string     `gorm:"column:arch" json:"arch"`
	OssObjectKey  string     `gorm:"column:oss_object_key" json:"ossObjectKey"`
	DownloadURL   string     `gorm:"column:download_url" json:"downloadUrl"`
	FileSize      int64      `gorm:"column:file_size" json:"fileSize"`
	Status        string     `gorm:"column:status" json:"status"`
	CreatedAt     *time.Time `gorm:"column:created_at" json:"createdAt"`
	UpdatedAt     *time.Time `gorm:"column:updated_at" json:"updatedAt"`
}

func (ExternalAppUpdate) TableName() string {
	return "app_updates"
}
