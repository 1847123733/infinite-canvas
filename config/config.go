package config

import (
	"crypto/rand"
	"encoding/base64"
	"strings"

	"github.com/caarlos0/env/v11"
	"github.com/joho/godotenv"
)

type Config struct {
	BindAddr                string `env:"BIND_ADDR" envDefault:"0.0.0.0"`
	Port                    string `env:"PORT" envDefault:"8080"`
	AdminUsername           string `env:"ADMIN_USERNAME" envDefault:"admin"`
	AdminPassword           string `env:"ADMIN_PASSWORD" envDefault:"infinite-canvas"`
	JWTSecret               string `env:"JWT_SECRET" envDefault:"infinite-canvas"`
	JWTExpireHours          int    `env:"JWT_EXPIRE_HOURS" envDefault:"168"`
	StorageDriver           string `env:"STORAGE_DRIVER" envDefault:"sqlite"`
	DatabaseDSN             string `env:"DATABASE_DSN" envDefault:"data/infinite-canvas.db"`
	ExternalVbenDatabaseDSN string `env:"EXTERNAL_VBEN_DATABASE_DSN"`
	InfiniteCanvasCloudURL  string `env:"INFINITE_CANVAS_CLOUD_BASE_URL"`
	PublicBaseURL           string `env:"PUBLIC_BASE_URL"`
}

var Cfg Config

func Load() error {
	_ = godotenv.Load()
	if err := env.Parse(&Cfg); err != nil {
		return err
	}
	if strings.TrimSpace(Cfg.JWTSecret) == "" || Cfg.JWTSecret == "infinite-canvas" {
		secret, err := randomSecret()
		if err != nil {
			return err
		}
		Cfg.JWTSecret = secret
	}
	return nil
}

func randomSecret() (string, error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(buf), nil
}
