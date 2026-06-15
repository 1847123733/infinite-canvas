package service

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"image"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"mime/multipart"
	"net/http"
	"net/url"
	"strings"

	"github.com/aliyun/aliyun-oss-go-sdk/oss"
	"github.com/basketikun/infinite-canvas/model"
	"github.com/google/uuid"
)

type DesktopGenerationInput struct {
	TicketID    string
	TicketToken string
	DeviceID    string
	References  []DesktopReferenceImage
	Mask        *DesktopReferenceImage
}

type DesktopReferenceImage struct {
	Filename    string
	ContentType string
	Bytes       []byte
}

type DesktopGenerationResult struct {
	URL        string
	ObjectKey  string
	MIMEType   string
	Width      int
	Height     int
	Bytes      int64
	Base64Data string
}

type desktopProviderImagePayload struct {
	Data []struct {
		B64JSON string `json:"b64_json"`
		URL     string `json:"url"`
	} `json:"data"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error"`
	Msg string `json:"msg"`
}

func GenerateDesktopCloudImage(authHeader string, input DesktopGenerationInput) (DesktopGenerationResult, error) {
	var zero DesktopGenerationResult
	exchange, err := exchangeDesktopCloudGenerationTicket(authHeader, input.TicketID, input.TicketToken, input.DeviceID)
	if err != nil {
		return zero, err
	}
	imageBytes, mimeType, err := requestDesktopProviderImage(exchange, input)
	if err != nil {
		_ = reportDesktopGenerationFailure(authHeader, exchange.Task.ID, "provider_request", err, map[string]any{
			"modelName": exchange.Model.ModelName,
			"scene":     exchange.Task.Scene,
		})
		return zero, err
	}
	width, height := readDesktopImageSize(imageBytes)
	if err := uploadDesktopOSSObject(exchange.OSS, imageBytes, mimeType); err != nil {
		_ = reportDesktopGenerationFailure(authHeader, exchange.Task.ID, "oss_upload", err, map[string]any{
			"bucket":    exchange.OSS.Bucket,
			"objectKey": exchange.OSS.ObjectKey,
			"mimeType":  mimeType,
			"bytes":     len(imageBytes),
		})
		return zero, err
	}
	publicURL, err := buildDesktopOSSPublicURL(exchange.OSS.Endpoint, exchange.OSS.Bucket, exchange.OSS.ObjectKey)
	if err != nil {
		_ = reportDesktopGenerationFailure(authHeader, exchange.Task.ID, "result_url", err, map[string]any{
			"bucket":    exchange.OSS.Bucket,
			"objectKey": exchange.OSS.ObjectKey,
		})
		return zero, err
	}
	_, err = completeDesktopCloudGenerationTask(authHeader, exchange.Task.ID, map[string]any{
		"eventId":   randomEventID(),
		"bucket":    exchange.OSS.Bucket,
		"objectKey": exchange.OSS.ObjectKey,
		"mimeType":  mimeType,
		"size":      len(imageBytes),
		"width":     width,
		"height":    height,
	})
	if err != nil {
		_ = reportDesktopGenerationFailure(authHeader, exchange.Task.ID, "task_complete_callback", err, map[string]any{
			"bucket":    exchange.OSS.Bucket,
			"objectKey": exchange.OSS.ObjectKey,
			"publicUrl": publicURL,
		})
		return zero, err
	}
	return DesktopGenerationResult{
		URL:        publicURL,
		ObjectKey:  exchange.OSS.ObjectKey,
		MIMEType:   mimeType,
		Width:      width,
		Height:     height,
		Bytes:      int64(len(imageBytes)),
		Base64Data: base64.StdEncoding.EncodeToString(imageBytes),
	}, nil
}

func requestDesktopProviderImage(exchange DesktopCloudExchangeResult, input DesktopGenerationInput) ([]byte, string, error) {
	if len(input.References) > 0 || input.Mask != nil {
		return requestDesktopProviderEdit(exchange, input)
	}
	return requestDesktopProviderGeneration(exchange)
}

func requestDesktopProviderGeneration(exchange DesktopCloudExchangeResult) ([]byte, string, error) {
	body := map[string]any{
		"model":           exchange.Model.ModelName,
		"prompt":          exchange.Task.FinalPrompt,
		"n":               1,
		"response_format": "b64_json",
		"output_format":   "png",
	}
	if value := desktopRequestMetaString(exchange.Task.RequestMeta, "quality"); value != "" {
		body["quality"] = value
	}
	if value := desktopRequestMetaString(exchange.Task.RequestMeta, "size"); value != "" {
		body["size"] = value
	}
	data, _ := json.Marshal(body)
	request, err := http.NewRequest(http.MethodPost, BuildModelChannelURL(model.ModelChannel{BaseURL: exchange.Model.BaseURL}, "/images/generations"), bytes.NewReader(data))
	if err != nil {
		return nil, "", err
	}
	request.Header.Set("Authorization", "Bearer "+exchange.Model.APIKey)
	request.Header.Set("Content-Type", "application/json")
	return doDesktopProviderImageRequest(request)
}

func requestDesktopProviderEdit(exchange DesktopCloudExchangeResult, input DesktopGenerationInput) ([]byte, string, error) {
	buffer := &bytes.Buffer{}
	writer := multipart.NewWriter(buffer)
	_ = writer.WriteField("model", exchange.Model.ModelName)
	_ = writer.WriteField("prompt", exchange.Task.FinalPrompt)
	_ = writer.WriteField("n", "1")
	_ = writer.WriteField("response_format", "b64_json")
	_ = writer.WriteField("output_format", "png")
	if value := desktopRequestMetaString(exchange.Task.RequestMeta, "quality"); value != "" {
		_ = writer.WriteField("quality", value)
	}
	if value := desktopRequestMetaString(exchange.Task.RequestMeta, "size"); value != "" {
		_ = writer.WriteField("size", value)
	}
	for index, item := range input.References {
		name := item.Filename
		if strings.TrimSpace(name) == "" {
			name = fmt.Sprintf("reference-%d.png", index+1)
		}
		part, err := writer.CreateFormFile("image", name)
		if err != nil {
			return nil, "", err
		}
		if _, err := part.Write(item.Bytes); err != nil {
			return nil, "", err
		}
	}
	if input.Mask != nil {
		maskPart, err := writer.CreateFormFile("mask", firstNonEmpty(strings.TrimSpace(input.Mask.Filename), "mask.png"))
		if err != nil {
			return nil, "", err
		}
		if _, err := maskPart.Write(input.Mask.Bytes); err != nil {
			return nil, "", err
		}
	}
	if err := writer.Close(); err != nil {
		return nil, "", err
	}
	request, err := http.NewRequest(http.MethodPost, BuildModelChannelURL(model.ModelChannel{BaseURL: exchange.Model.BaseURL}, "/images/edits"), buffer)
	if err != nil {
		return nil, "", err
	}
	request.Header.Set("Authorization", "Bearer "+exchange.Model.APIKey)
	request.Header.Set("Content-Type", writer.FormDataContentType())
	return doDesktopProviderImageRequest(request)
}

func doDesktopProviderImageRequest(request *http.Request) ([]byte, string, error) {
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		return nil, "", desktopGenerationError{message: "图片模型请求失败"}
	}
	defer response.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(response.Body, 16<<20))
	if response.StatusCode >= http.StatusBadRequest {
		return nil, "", desktopGenerationError{message: readDesktopProviderError(body, response.StatusCode)}
	}
	var payload desktopProviderImagePayload
	if err := json.Unmarshal(body, &payload); err != nil {
		return nil, "", desktopGenerationError{message: "图片模型返回格式不正确"}
	}
	if len(payload.Data) == 0 {
		return nil, "", desktopGenerationError{message: firstNonEmpty(strings.TrimSpace(payload.Msg), "图片模型没有返回结果")}
	}
	item := payload.Data[0]
	if strings.TrimSpace(item.B64JSON) != "" {
		imageBytes, err := base64.StdEncoding.DecodeString(item.B64JSON)
		if err != nil {
			return nil, "", desktopGenerationError{message: "图片模型返回了无效图片数据"}
		}
		return imageBytes, detectDesktopImageMIMEType(imageBytes), nil
	}
	if strings.TrimSpace(item.URL) != "" {
		imageBytes, mimeType, err := fetchDesktopImageURL(item.URL)
		if err != nil {
			return nil, "", err
		}
		return imageBytes, mimeType, nil
	}
	return nil, "", desktopGenerationError{message: "图片模型没有返回可用图片"}
}

func uploadDesktopOSSObject(config DesktopCloudGenerationOSS, imageBytes []byte, mimeType string) error {
	options := []oss.ClientOption{}
	if strings.TrimSpace(config.SecurityToken) != "" {
		options = append(options, oss.SecurityToken(strings.TrimSpace(config.SecurityToken)))
	}
	client, err := oss.New(strings.TrimSpace(config.Endpoint), strings.TrimSpace(config.AccessKeyID), strings.TrimSpace(config.AccessKeySecret), options...)
	if err != nil {
		return desktopGenerationError{message: "OSS 客户端初始化失败"}
	}
	bucket, err := client.Bucket(strings.TrimSpace(config.Bucket))
	if err != nil {
		return desktopGenerationError{message: "OSS Bucket 打开失败"}
	}
	putOptions := []oss.Option{}
	if strings.TrimSpace(mimeType) != "" {
		putOptions = append(putOptions, oss.ContentType(strings.TrimSpace(mimeType)))
	}
	if err := bucket.PutObject(strings.TrimSpace(config.ObjectKey), bytes.NewReader(imageBytes), putOptions...); err != nil {
		return desktopGenerationError{message: "上传最终图片到 OSS 失败"}
	}
	return nil
}

func reportDesktopGenerationFailure(authHeader string, taskID string, stage string, cause error, extra map[string]any) error {
	message := "桌面端生成失败"
	if cause != nil {
		message = cause.Error()
	}
	payload := map[string]any{
		"stage": stage,
	}
	for key, value := range extra {
		payload[key] = value
	}
	_, err := failDesktopCloudGenerationTask(authHeader, taskID, map[string]any{
		"eventId":      randomEventID(),
		"errorCode":    "DESKTOP_GENERATION_FAILED",
		"errorMessage": message,
		"payload":      payload,
	})
	return err
}

func desktopRequestMetaString(meta map[string]any, key string) string {
	value, ok := meta[key]
	if !ok || value == nil {
		return ""
	}
	text := strings.TrimSpace(fmt.Sprint(value))
	if text == "" || text == "<nil>" {
		return ""
	}
	return text
}

func readDesktopProviderError(body []byte, statusCode int) string {
	var payload desktopProviderImagePayload
	if err := json.Unmarshal(body, &payload); err == nil {
		if payload.Error != nil && strings.TrimSpace(payload.Error.Message) != "" {
			return payload.Error.Message
		}
		if strings.TrimSpace(payload.Msg) != "" {
			return payload.Msg
		}
	}
	if statusCode == http.StatusUnauthorized || statusCode == http.StatusForbidden {
		return "图片模型鉴权失败"
	}
	if statusCode == http.StatusTooManyRequests {
		return "图片模型请求被限流或额度不足"
	}
	return "图片模型请求失败"
}

func fetchDesktopImageURL(rawURL string) ([]byte, string, error) {
	request, err := http.NewRequest(http.MethodGet, strings.TrimSpace(rawURL), nil)
	if err != nil {
		return nil, "", err
	}
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		return nil, "", desktopGenerationError{message: "下载图片模型结果失败"}
	}
	defer response.Body.Close()
	if response.StatusCode >= http.StatusBadRequest {
		return nil, "", desktopGenerationError{message: "下载图片模型结果失败"}
	}
	body, err := io.ReadAll(io.LimitReader(response.Body, 16<<20))
	if err != nil {
		return nil, "", desktopGenerationError{message: "读取图片模型结果失败"}
	}
	return body, firstNonEmpty(strings.TrimSpace(response.Header.Get("Content-Type")), detectDesktopImageMIMEType(body)), nil
}

func detectDesktopImageMIMEType(imageBytes []byte) string {
	if len(imageBytes) == 0 {
		return "image/png"
	}
	return http.DetectContentType(imageBytes)
}

func readDesktopImageSize(imageBytes []byte) (int, int) {
	config, _, err := image.DecodeConfig(bytes.NewReader(imageBytes))
	if err != nil {
		return 0, 0
	}
	return config.Width, config.Height
}

func buildDesktopOSSPublicURL(endpoint string, bucket string, objectKey string) (string, error) {
	parsed, err := url.Parse(strings.TrimSpace(endpoint))
	if err != nil || strings.TrimSpace(parsed.Host) == "" {
		return "", errors.New("OSS Endpoint 格式不正确")
	}
	scheme := parsed.Scheme
	if strings.TrimSpace(scheme) == "" {
		scheme = "https"
	}
	return fmt.Sprintf("%s://%s.%s/%s", scheme, strings.TrimSpace(bucket), parsed.Host, strings.TrimLeft(strings.TrimSpace(objectKey), "/")), nil
}

type desktopGenerationError struct {
	message string
}

func (err desktopGenerationError) Error() string {
	return err.message
}

func (err desktopGenerationError) SafeMessage() string {
	return err.message
}

func randomEventID() string {
	return uuid.NewString()
}
