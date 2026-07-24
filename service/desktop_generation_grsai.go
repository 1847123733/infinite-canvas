package service

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// grsai 绘图协议(nano-banana 系列),文档:https://qmy27nhsd9.apifox.cn/452392911e0
// 提交:POST {base}/v1/api/generate(replyType=async)
// 轮询:GET  {base}/v1/api/result?id=xxx

type grsaiGenerateRequest struct {
	Model       string   `json:"model"`
	Prompt      string   `json:"prompt"`
	Images      []string `json:"images,omitempty"`
	AspectRatio string   `json:"aspectRatio,omitempty"`
	ImageSize   string   `json:"imageSize,omitempty"`
	ReplyType   string   `json:"replyType"`
}

type grsaiTaskPayload struct {
	ID       string `json:"id"`
	Status   string `json:"status"`
	Progress int    `json:"progress"`
	Error    string `json:"error"`
	Results  []struct {
		URL string `json:"url"`
	} `json:"results"`
}

var (
	grsaiPollInterval = 3 * time.Second
	grsaiPollTimeout  = 10 * time.Minute
)

func requestDesktopGrsaiGeneration(exchange DesktopCloudExchangeResult, input DesktopGenerationInput) ([]byte, string, error) {
	prompt := exchange.Task.FinalPrompt
	images := make([]string, 0, len(input.References)+1)
	for _, item := range input.References {
		images = append(images, grsaiImageDataURI(item))
	}
	if input.Mask != nil {
		// grsai 没有独立蒙版参数,与 Gemini 协议一致:末尾追加蒙版图并用文字说明
		prompt += "\n\nThe last image below is a mask: white areas indicate regions to modify, black areas must be preserved."
		images = append(images, grsaiImageDataURI(*input.Mask))
	}
	body := grsaiGenerateRequest{
		Model:     exchange.Model.ModelName,
		Prompt:    prompt,
		Images:    images,
		ReplyType: "async",
	}
	if ratio := mapDesktopSizeToGeminiAspectRatio(desktopRequestMetaString(exchange.Task.RequestMeta, "size")); ratio != "" {
		body.AspectRatio = ratio
	}
	if size := normalizeGrsaiImageSize(desktopRequestMetaString(exchange.Task.RequestMeta, "imageSize")); size != "" {
		body.ImageSize = size
	}
	payload, err := postDesktopGrsaiGenerate(exchange, body)
	if err != nil {
		return nil, "", err
	}
	final, err := waitDesktopGrsaiResult(exchange, payload)
	if err != nil {
		return nil, "", err
	}
	return fetchDesktopGrsaiResultImage(final)
}

func postDesktopGrsaiGenerate(exchange DesktopCloudExchangeResult, body grsaiGenerateRequest) (grsaiTaskPayload, error) {
	data, _ := json.Marshal(body)
	requestURL := buildDesktopGrsaiURL(exchange.Model.BaseURL, "/v1/api/generate")
	request, err := http.NewRequest(http.MethodPost, requestURL, bytes.NewReader(data))
	if err != nil {
		return grsaiTaskPayload{}, err
	}
	request.Header.Set("Authorization", "Bearer "+exchange.Model.APIKey)
	request.Header.Set("Content-Type", "application/json")
	log.Printf("desktop grsai generate request url=%s model=%s images=%d aspectRatio=%s", requestURL, body.Model, len(body.Images), body.AspectRatio)
	return doDesktopGrsaiRequest(request)
}

func waitDesktopGrsaiResult(exchange DesktopCloudExchangeResult, payload grsaiTaskPayload) (grsaiTaskPayload, error) {
	if done, err := grsaiTaskOutcome(payload); done || err != nil {
		return payload, err
	}
	taskID := strings.TrimSpace(payload.ID)
	if taskID == "" {
		return payload, desktopGenerationError{message: "图片模型没有返回任务 ID"}
	}
	requestURL := buildDesktopGrsaiURL(exchange.Model.BaseURL, "/v1/api/result") + "?id=" + url.QueryEscape(taskID)
	deadline := time.Now().Add(grsaiPollTimeout)
	lastProgress := -1
	failures := 0
	for time.Now().Before(deadline) {
		time.Sleep(grsaiPollInterval)
		request, err := http.NewRequest(http.MethodGet, requestURL, nil)
		if err != nil {
			return payload, err
		}
		request.Header.Set("Authorization", "Bearer "+exchange.Model.APIKey)
		current, err := doDesktopGrsaiRequest(request)
		if err != nil {
			failures++
			if failures >= 3 {
				return payload, err
			}
			continue
		}
		failures = 0
		if current.Progress != lastProgress {
			log.Printf("desktop grsai task progress id=%s status=%s progress=%d", taskID, current.Status, current.Progress)
			lastProgress = current.Progress
		}
		if done, err := grsaiTaskOutcome(current); done || err != nil {
			return current, err
		}
	}
	return payload, desktopGenerationError{message: "图片生成超时，请稍后重试"}
}

func doDesktopGrsaiRequest(request *http.Request) (grsaiTaskPayload, error) {
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		log.Printf("desktop grsai request failed url=%s err=%v", request.URL.String(), err)
		return grsaiTaskPayload{}, desktopGenerationError{message: "图片模型请求失败"}
	}
	defer response.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(response.Body, 4<<20))
	var payload grsaiTaskPayload
	parseErr := json.Unmarshal(raw, &payload)
	if response.StatusCode >= http.StatusBadRequest {
		log.Printf("desktop grsai request error url=%s status=%d body=%s", request.URL.String(), response.StatusCode, logSnippet(raw))
		return grsaiTaskPayload{}, desktopGrsaiHTTPError(response.StatusCode, payload)
	}
	if parseErr != nil {
		log.Printf("desktop grsai response invalid url=%s status=%d body=%s", request.URL.String(), response.StatusCode, logSnippet(raw))
		return grsaiTaskPayload{}, desktopGenerationError{message: "图片模型返回格式不正确"}
	}
	return payload, nil
}

func fetchDesktopGrsaiResultImage(payload grsaiTaskPayload) ([]byte, string, error) {
	for _, item := range payload.Results {
		resultURL := strings.TrimSpace(item.URL)
		if resultURL == "" {
			continue
		}
		return fetchDesktopImageURL(resultURL)
	}
	return nil, "", desktopGenerationError{message: "图片模型没有返回可用图片"}
}

// grsaiTaskOutcome 返回任务是否已到终态;违规/失败转换为对用户可见的错误。
func grsaiTaskOutcome(payload grsaiTaskPayload) (bool, error) {
	if err := grsaiTerminalStatusError(payload); err != nil {
		return true, err
	}
	return strings.EqualFold(strings.TrimSpace(payload.Status), "succeeded"), nil
}

func grsaiTerminalStatusError(payload grsaiTaskPayload) error {
	message := strings.TrimSpace(payload.Error)
	switch strings.ToLower(strings.TrimSpace(payload.Status)) {
	case "violation":
		return desktopGenerationError{message: "生成请求被安全策略拦截（" + firstNonEmpty(message, "内容涉嫌违规") + "），请调整提示词后重试"}
	case "failed":
		return desktopGenerationError{message: firstNonEmpty(message, "图片模型生成失败")}
	}
	return nil
}

func desktopGrsaiHTTPError(statusCode int, payload grsaiTaskPayload) error {
	if err := grsaiTerminalStatusError(payload); err != nil {
		return err
	}
	if message := strings.TrimSpace(payload.Error); message != "" {
		return desktopGenerationError{message: message}
	}
	if statusCode == http.StatusUnauthorized || statusCode == http.StatusForbidden {
		return desktopGenerationError{message: "图片模型鉴权失败"}
	}
	if statusCode == http.StatusTooManyRequests {
		return desktopGenerationError{message: "图片模型请求被限流或额度不足"}
	}
	return desktopGenerationError{message: "图片模型请求失败"}
}

// buildDesktopGrsaiURL 拼接 grsai 绘图接口地址;绘图接口挂在站点根路径 /v1/api 下,
// 配置成 OpenAI(/v1)或 Gemini(/v1beta)风格地址时自动纠正。
func buildDesktopGrsaiURL(baseURL string, path string) string {
	base := strings.TrimRight(strings.TrimSpace(baseURL), "/")
	lower := strings.ToLower(base)
	for _, suffix := range []string{"/v1/api", "/v1beta", "/v1"} {
		if strings.HasSuffix(lower, suffix) {
			base = base[:len(base)-len(suffix)]
			break
		}
	}
	return strings.TrimRight(base, "/") + path
}

func grsaiImageDataURI(item DesktopReferenceImage) string {
	mimeType := strings.TrimSpace(item.ContentType)
	if !strings.HasPrefix(mimeType, "image/") {
		mimeType = detectDesktopImageMIMEType(item.Bytes)
	}
	return "data:" + mimeType + ";base64," + base64.StdEncoding.EncodeToString(item.Bytes)
}

func normalizeGrsaiImageSize(value string) string {
	switch strings.ToUpper(strings.TrimSpace(value)) {
	case "1K":
		return "1K"
	case "2K":
		return "2K"
	case "4K":
		return "4K"
	}
	return ""
}
