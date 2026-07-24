package service

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"

	"github.com/basketikun/infinite-canvas/config"
)

type desktopCloudEnvelope[T any] struct {
	Code    int    `json:"code"`
	Data    T      `json:"data"`
	Message string `json:"message"`
	Msg     string `json:"msg"`
}

type DesktopCloudGenerationTicket struct {
	TaskID      string `json:"taskId"`
	TicketID    string `json:"ticketId"`
	TicketToken string `json:"ticketToken"`
	ExpiresAt   string `json:"expiresAt"`
}

type DesktopCloudGenerationTask struct {
	ID          string         `json:"id"`
	Scene       string         `json:"scene"`
	UserPrompt  string         `json:"userPrompt"`
	FinalPrompt string         `json:"finalPrompt"`
	RequestMeta map[string]any `json:"requestMeta"`
}

type DesktopCloudGenerationModel struct {
	BaseURL     string `json:"baseUrl"`
	APIKey      string `json:"apiKey"`
	ModelName   string `json:"modelName"`
	RequestMode string `json:"requestMode"`
	Protocol    string `json:"protocol"`
}

type DesktopCloudGenerationOSS struct {
	Endpoint        string `json:"endpoint"`
	Bucket          string `json:"bucket"`
	ObjectKey       string `json:"objectKey"`
	AccessKeyID     string `json:"accessKeyId"`
	AccessKeySecret string `json:"accessKeySecret"`
	SecurityToken   string `json:"securityToken"`
	AuthMode        string `json:"authMode"`
	ExpiresAt       string `json:"expiresAt"`
}

type DesktopCloudExchangeResult struct {
	Task  DesktopCloudGenerationTask  `json:"task"`
	Model DesktopCloudGenerationModel `json:"model"`
	OSS   DesktopCloudGenerationOSS   `json:"oss"`
}

type DesktopCloudTaskResult struct {
	TaskID    string `json:"taskId"`
	Status    string `json:"status"`
	ResultURL string `json:"resultUrl"`
}

type desktopCloudClientError struct {
	message string
}

func (err desktopCloudClientError) Error() string {
	return err.message
}

func (err desktopCloudClientError) SafeMessage() string {
	return err.message
}

func createDesktopCloudGenerationTicket(authHeader string, payload map[string]any) (DesktopCloudGenerationTicket, error) {
	return desktopCloudJSONRequest[DesktopCloudGenerationTicket](http.MethodPost, "/api/infinite-canvas/generation-tickets", authHeader, "", payload)
}

func exchangeDesktopCloudGenerationTicket(authHeader string, ticketID string, ticketToken string, deviceID string) (DesktopCloudExchangeResult, error) {
	return desktopCloudJSONRequest[DesktopCloudExchangeResult](http.MethodPost, "/api/infinite-canvas/generation-tickets/exchange", authHeader, ticketToken, map[string]any{
		"ticketId": ticketID,
		"deviceId": deviceID,
	})
}

func completeDesktopCloudGenerationTask(authHeader string, taskID string, payload map[string]any) (DesktopCloudTaskResult, error) {
	return desktopCloudJSONRequest[DesktopCloudTaskResult](http.MethodPost, "/api/infinite-canvas/generation-tasks/"+taskID+"/complete", authHeader, "", payload)
}

func failDesktopCloudGenerationTask(authHeader string, taskID string, payload map[string]any) (DesktopCloudTaskResult, error) {
	return desktopCloudJSONRequest[DesktopCloudTaskResult](http.MethodPost, "/api/infinite-canvas/generation-tasks/"+taskID+"/fail", authHeader, "", payload)
}

func desktopCloudJSONRequest[T any](method string, path string, authHeader string, ticketToken string, payload any) (T, error) {
	var zero T
	baseURL := strings.TrimRight(strings.TrimSpace(config.Cfg.InfiniteCanvasCloudURL), "/")
	if baseURL == "" {
		return zero, desktopCloudClientError{message: "未配置云端控制服务地址"}
	}
	var body io.Reader
	if payload != nil {
		data, err := json.Marshal(payload)
		if err != nil {
			return zero, err
		}
		body = bytes.NewReader(data)
	}
	request, err := http.NewRequest(method, baseURL+path, body)
	if err != nil {
		return zero, err
	}
	request.Header.Set("Authorization", authHeader)
	if payload != nil {
		request.Header.Set("Content-Type", "application/json")
	}
	if strings.TrimSpace(ticketToken) != "" {
		request.Header.Set("X-Generation-Ticket", strings.TrimSpace(ticketToken))
	}
	response, err := desktopCloudHTTPClient.Do(request)
	if err != nil {
		log.Printf("desktop cloud request failed path=%s err=%v", path, err)
		return zero, desktopCloudClientError{message: "云端控制服务请求失败"}
	}
	defer response.Body.Close()
	bodyBytes, _ := io.ReadAll(io.LimitReader(response.Body, 2<<20))
	var envelope desktopCloudEnvelope[T]
	if err := json.Unmarshal(bodyBytes, &envelope); err != nil {
		log.Printf("desktop cloud response invalid path=%s status=%d body=%s", path, response.StatusCode, logSnippet(bodyBytes))
		return zero, desktopCloudClientError{message: "云端控制服务返回异常"}
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 || envelope.Code != 0 {
		message := firstNonEmpty(strings.TrimSpace(envelope.Message), strings.TrimSpace(envelope.Msg), "云端控制服务请求失败")
		log.Printf("desktop cloud request rejected path=%s status=%d code=%d msg=%s body=%s", path, response.StatusCode, envelope.Code, message, logSnippet(bodyBytes))
		return zero, desktopCloudClientError{message: fmt.Sprintf("%s", message)}
	}
	return envelope.Data, nil
}
