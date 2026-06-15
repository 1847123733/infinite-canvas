package service

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/basketikun/infinite-canvas/config"
	"github.com/basketikun/infinite-canvas/model"
)

const desktopCloudUserIDPrefix = "desktop-cloud-"

var desktopCloudHTTPClient = &http.Client{Timeout: 10 * time.Second}

type desktopCloudMeEnvelope struct {
	Code    int            `json:"code"`
	Data    desktopCloudMe `json:"data"`
	Message string         `json:"message"`
	Msg     string         `json:"msg"`
}

type desktopCloudMe struct {
	User        desktopCloudUser `json:"user"`
	SessionID   string           `json:"sessionId"`
	CanGenerate bool             `json:"canGenerate"`
}

type desktopCloudUser struct {
	ID          int    `json:"id"`
	Username    string `json:"username"`
	DisplayName string `json:"displayName"`
}

func CurrentDesktopCloudUser(tokenText string) (model.AuthUser, bool) {
	baseURL := strings.TrimSpace(config.Cfg.InfiniteCanvasCloudURL)
	if baseURL == "" || strings.TrimSpace(tokenText) == "" {
		return model.AuthUser{}, false
	}
	request, err := http.NewRequest(http.MethodGet, strings.TrimRight(baseURL, "/")+"/api/infinite-canvas/auth/me", nil)
	if err != nil {
		return model.AuthUser{}, false
	}
	request.Header.Set("Authorization", "Bearer "+tokenText)
	response, err := desktopCloudHTTPClient.Do(request)
	if err != nil {
		return model.AuthUser{}, false
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return model.AuthUser{}, false
	}
	var payload desktopCloudMeEnvelope
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		return model.AuthUser{}, false
	}
	if payload.Code != 0 || !payload.Data.CanGenerate || payload.Data.User.ID <= 0 || strings.TrimSpace(payload.Data.User.Username) == "" {
		return model.AuthUser{}, false
	}
	return model.AuthUser{
		ID:          desktopCloudUserIDPrefix + strconv.Itoa(payload.Data.User.ID),
		Username:    payload.Data.User.Username,
		DisplayName: firstNonEmpty(payload.Data.User.DisplayName, payload.Data.User.Username),
		Role:        model.UserRoleUser,
	}, true
}

func IsDesktopCloudUserID(userID string) bool {
	return strings.HasPrefix(userID, desktopCloudUserIDPrefix)
}
