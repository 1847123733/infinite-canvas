package service

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"io"
	"log"
	"math"
	"net/http"
	"net/url"
	"strconv"
	"strings"
)

type geminiInlineData struct {
	MimeType string `json:"mime_type"`
	Data     string `json:"data"`
}

type geminiPart struct {
	Text       string            `json:"text,omitempty"`
	InlineData *geminiInlineData `json:"inline_data,omitempty"`
}

type geminiContent struct {
	Role  string       `json:"role,omitempty"`
	Parts []geminiPart `json:"parts"`
}

type geminiImageConfig struct {
	AspectRatio string `json:"aspectRatio,omitempty"`
}

type geminiGenerationConfig struct {
	ResponseModalities []string           `json:"responseModalities,omitempty"`
	ImageConfig        *geminiImageConfig `json:"imageConfig,omitempty"`
}

type geminiGenerateRequest struct {
	Contents         []geminiContent         `json:"contents"`
	GenerationConfig *geminiGenerationConfig `json:"generationConfig,omitempty"`
}

// 响应字段是 camelCase(inlineData/mimeType),与请求端 snake_case 不同,须单独定义。
type geminiGenerateResponse struct {
	Candidates []struct {
		Content struct {
			Parts []struct {
				Text       string `json:"text"`
				InlineData *struct {
					MimeType string `json:"mimeType"`
					Data     string `json:"data"`
				} `json:"inlineData"`
			} `json:"parts"`
		} `json:"content"`
		FinishReason string `json:"finishReason"`
	} `json:"candidates"`
	PromptFeedback *struct {
		BlockReason string `json:"blockReason"`
	} `json:"promptFeedback"`
	Error *struct {
		Code    int    `json:"code"`
		Message string `json:"message"`
		Status  string `json:"status"`
	} `json:"error"`
}

func requestDesktopGeminiGeneration(exchange DesktopCloudExchangeResult, input DesktopGenerationInput) ([]byte, string, error) {
	parts := []geminiPart{{Text: exchange.Task.FinalPrompt}}
	for _, item := range input.References {
		parts = append(parts, geminiInlineImagePart(item))
	}
	if input.Mask != nil {
		parts = append(parts, geminiPart{Text: "The last image below is a mask: white areas indicate regions to modify, black areas must be preserved."})
		parts = append(parts, geminiInlineImagePart(*input.Mask))
	}
	generationConfig := &geminiGenerationConfig{ResponseModalities: []string{"TEXT", "IMAGE"}}
	if ratio := mapDesktopSizeToGeminiAspectRatio(desktopRequestMetaString(exchange.Task.RequestMeta, "size")); ratio != "" {
		generationConfig.ImageConfig = &geminiImageConfig{AspectRatio: ratio}
	}
	requestURL := buildDesktopGeminiURL(exchange.Model.BaseURL, exchange.Model.ModelName)
	body, _ := json.Marshal(geminiGenerateRequest{
		Contents:         []geminiContent{{Role: "user", Parts: parts}},
		GenerationConfig: generationConfig,
	})
	imageBytes, mimeType, err := doDesktopGeminiRequest(requestURL, exchange.Model.APIKey, body, exchange.Model.ModelName)
	if err != nil && generationConfig.ImageConfig != nil && isDesktopGeminiInvalidArgument(err) {
		// 部分老模型/转发商不支持 imageConfig,去掉后重试一次
		log.Printf("desktop gemini image request retry without imageConfig model=%s", exchange.Model.ModelName)
		generationConfig.ImageConfig = nil
		body, _ = json.Marshal(geminiGenerateRequest{
			Contents:         []geminiContent{{Role: "user", Parts: parts}},
			GenerationConfig: generationConfig,
		})
		return doDesktopGeminiRequest(requestURL, exchange.Model.APIKey, body, exchange.Model.ModelName)
	}
	return imageBytes, mimeType, err
}

func buildDesktopGeminiURL(baseURL string, modelName string) string {
	base := strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if parsed, err := url.Parse(base); err == nil &&
		strings.EqualFold(parsed.Host, "generativelanguage.googleapis.com") &&
		strings.TrimRight(parsed.Path, "/") == "" {
		base += "/v1beta"
	}
	// 中转站(grsai/one-api/new-api 等)的 /v1 是 OpenAI 兼容端点,
	// Gemini 原生协议挂在 /v1beta,配置了 OpenAI 风格地址时自动纠正。
	if strings.HasSuffix(strings.ToLower(base), "/v1") {
		base = base[:len(base)-len("/v1")] + "/v1beta"
	}
	return base + "/models/" + url.PathEscape(strings.TrimSpace(modelName)) + ":generateContent"
}

func geminiInlineImagePart(item DesktopReferenceImage) geminiPart {
	mimeType := strings.TrimSpace(item.ContentType)
	if !strings.HasPrefix(mimeType, "image/") {
		mimeType = detectDesktopImageMIMEType(item.Bytes)
	}
	return geminiPart{InlineData: &geminiInlineData{
		MimeType: mimeType,
		Data:     base64.StdEncoding.EncodeToString(item.Bytes),
	}}
}

var desktopGeminiAspectRatios = []struct {
	name  string
	value float64
}{
	{"1:1", 1}, {"2:3", 2.0 / 3}, {"3:2", 1.5}, {"3:4", 0.75}, {"4:3", 4.0 / 3},
	{"4:5", 0.8}, {"5:4", 1.25}, {"9:16", 9.0 / 16}, {"16:9", 16.0 / 9}, {"21:9", 21.0 / 9},
}

func mapDesktopSizeToGeminiAspectRatio(size string) string {
	parts := strings.SplitN(strings.ToLower(strings.TrimSpace(size)), "x", 2)
	if len(parts) != 2 {
		return ""
	}
	width, errWidth := strconv.Atoi(strings.TrimSpace(parts[0]))
	height, errHeight := strconv.Atoi(strings.TrimSpace(parts[1]))
	if errWidth != nil || errHeight != nil || width <= 0 || height <= 0 {
		return ""
	}
	target := float64(width) / float64(height)
	best, bestDiff := "", math.MaxFloat64
	for _, item := range desktopGeminiAspectRatios {
		diff := math.Abs(math.Log(target / item.value))
		if diff < bestDiff {
			best, bestDiff = item.name, diff
		}
	}
	return best
}

func doDesktopGeminiRequest(requestURL string, apiKey string, body []byte, modelName string) ([]byte, string, error) {
	request, err := http.NewRequest(http.MethodPost, requestURL, bytes.NewReader(body))
	if err != nil {
		return nil, "", err
	}
	request.Header.Set("x-goog-api-key", apiKey)
	request.Header.Set("Content-Type", "application/json")
	log.Printf("desktop gemini image request url=%s model=%s", requestURL, modelName)
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		log.Printf("desktop gemini image request failed url=%s model=%s err=%v", requestURL, modelName, err)
		return nil, "", desktopGenerationError{message: "图片模型请求失败"}
	}
	defer response.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(response.Body, 32<<20))
	var payload geminiGenerateResponse
	_ = json.Unmarshal(raw, &payload)
	if response.StatusCode >= http.StatusBadRequest || payload.Error != nil {
		log.Printf("desktop gemini image error url=%s model=%s status=%d body=%s", requestURL, modelName, response.StatusCode, logSnippet(raw))
		return nil, "", desktopGeminiHTTPError(response.StatusCode, &payload)
	}
	if payload.PromptFeedback != nil && strings.TrimSpace(payload.PromptFeedback.BlockReason) != "" {
		return nil, "", desktopGenerationError{message: "生成请求被安全策略拦截（" + payload.PromptFeedback.BlockReason + "），请调整提示词后重试"}
	}
	for _, candidate := range payload.Candidates {
		for _, part := range candidate.Content.Parts {
			if part.InlineData == nil || strings.TrimSpace(part.InlineData.Data) == "" {
				continue
			}
			imageBytes, err := decodeGeminiBase64(part.InlineData.Data)
			if err != nil {
				return nil, "", desktopGenerationError{message: "图片模型返回了无效图片数据"}
			}
			return imageBytes, firstNonEmpty(strings.TrimSpace(part.InlineData.MimeType), detectDesktopImageMIMEType(imageBytes)), nil
		}
	}
	if len(payload.Candidates) > 0 {
		if reason := strings.TrimSpace(payload.Candidates[0].FinishReason); reason != "" && reason != "STOP" {
			return nil, "", desktopGenerationError{message: "图片模型未返回图片（" + reason + "）"}
		}
	}
	log.Printf("desktop gemini image response without image url=%s model=%s status=%d body=%s", requestURL, modelName, response.StatusCode, logSnippet(raw))
	return nil, "", desktopGenerationError{message: "图片模型没有返回可用图片"}
}

func decodeGeminiBase64(data string) ([]byte, error) {
	trimmed := strings.TrimSpace(data)
	if decoded, err := base64.StdEncoding.DecodeString(trimmed); err == nil {
		return decoded, nil
	}
	return base64.RawStdEncoding.DecodeString(trimmed)
}

type desktopGeminiError struct {
	message    string
	statusCode int
	status     string
}

func (err desktopGeminiError) Error() string {
	return err.message
}

func (err desktopGeminiError) SafeMessage() string {
	return err.message
}

func desktopGeminiHTTPError(statusCode int, payload *geminiGenerateResponse) error {
	message := ""
	status := ""
	if payload != nil && payload.Error != nil {
		message = strings.TrimSpace(payload.Error.Message)
		status = strings.TrimSpace(payload.Error.Status)
	}
	if message == "" {
		switch {
		case statusCode == http.StatusUnauthorized || statusCode == http.StatusForbidden:
			message = "图片模型鉴权失败"
		case statusCode == http.StatusTooManyRequests:
			message = "图片模型请求被限流或额度不足"
		default:
			message = "图片模型请求失败"
		}
	}
	return desktopGeminiError{message: message, statusCode: statusCode, status: status}
}

func isDesktopGeminiInvalidArgument(err error) bool {
	geminiErr, ok := err.(desktopGeminiError)
	if !ok {
		return false
	}
	return geminiErr.statusCode == http.StatusBadRequest || strings.EqualFold(geminiErr.status, "INVALID_ARGUMENT")
}
