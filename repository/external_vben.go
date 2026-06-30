package repository

import (
	"errors"
	"strings"
	"sync"

	"github.com/basketikun/infinite-canvas/config"
	"github.com/basketikun/infinite-canvas/model"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

var (
	externalVbenDB     *gorm.DB
	externalVbenDBOnce sync.Once
	externalVbenDBErr  error
)

func ExternalVbenEnabled() bool {
	return strings.TrimSpace(config.Cfg.ExternalVbenDatabaseDSN) != ""
}

func externalVben() (*gorm.DB, error) {
	if !ExternalVbenEnabled() {
		return nil, errors.New("external vben database dsn is empty")
	}
	externalVbenDBOnce.Do(func() {
		externalVbenDB, externalVbenDBErr = gorm.Open(postgres.Open(config.Cfg.ExternalVbenDatabaseDSN), &gorm.Config{})
	})
	return externalVbenDB, externalVbenDBErr
}

func GetExternalVbenUserByUsername(username string) (model.ExternalVbenUser, bool, error) {
	db, err := externalVben()
	if err != nil {
		return model.ExternalVbenUser{}, false, err
	}
	var user model.ExternalVbenUser
	err = db.Where("username = ?", username).First(&user).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return model.ExternalVbenUser{}, false, nil
	}
	return user, err == nil, err
}

func ListExternalVbenRolesByIDs(ids []int) ([]model.ExternalVbenRole, error) {
	if len(ids) == 0 {
		return []model.ExternalVbenRole{}, nil
	}
	db, err := externalVben()
	if err != nil {
		return nil, err
	}
	var roles []model.ExternalVbenRole
	err = db.Where("id IN ?", ids).Order("id asc").Find(&roles).Error
	return roles, err
}

func ListExternalVbenLLMModels() ([]model.ExternalVbenLLMModel, error) {
	db, err := externalVben()
	if err != nil {
		return nil, err
	}
	var items []model.ExternalVbenLLMModel
	err = db.Where("enabled = ?", true).Order("is_default desc, protocol asc, api_base_url asc, model_name asc").Find(&items).Error
	return items, err
}

func GetLatestAppUpdate(platform, arch string) (*model.ExternalAppUpdate, error) {
	db, err := externalVben()
	if err != nil {
		return nil, err
	}
	var item model.ExternalAppUpdate
	err = db.Where("status = ? AND title = ? AND platform = ? AND arch = ?", "published", "Infinite Canvas", platform, arch).
		Order("created_at desc").
		Limit(1).
		Find(&item).Error
	if err != nil {
		return nil, err
	}
	if item.ID == 0 {
		return nil, nil
	}
	return &item, nil
}
