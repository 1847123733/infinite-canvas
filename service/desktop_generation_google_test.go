package service

import (
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestMapDesktopSizeToGeminiAspectRatio(t *testing.T) {
	cases := []struct {
		size string
		want string
	}{
		{"1024x1024", "1:1"},
		{"1792x1024", "16:9"},
		{"1024x1792", "9:16"},
		{"1536x1024", "3:2"},
		{"1024x1536", "2:3"},
		{" 1024X1024 ", "1:1"},
		{"", ""},
		{"auto", ""},
		{"1024", ""},
		{"0x100", ""},
		{"-10x100", ""},
	}
	for _, item := range cases {
		if got := mapDesktopSizeToGeminiAspectRatio(item.size); got != item.want {
			t.Errorf("mapDesktopSizeToGeminiAspectRatio(%q) = %q, want %q", item.size, got, item.want)
		}
	}
}

func TestBuildDesktopGeminiURL(t *testing.T) {
	cases := []struct {
		baseURL string
		model   string
		want    string
	}{
		{"https://generativelanguage.googleapis.com", "gemini-2.5-flash-image", "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent"},
		{"https://generativelanguage.googleapis.com/", "gemini-2.5-flash-image", "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent"},
		{"https://generativelanguage.googleapis.com/v1beta", "gemini-2.5-flash-image", "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent"},
		{"https://proxy.example.com/google", "gemini-2.5-flash-image", "https://proxy.example.com/google/models/gemini-2.5-flash-image:generateContent"},
		{"https://proxy.example.com", "gemini-2.5-flash-image", "https://proxy.example.com/models/gemini-2.5-flash-image:generateContent"},
		{"https://grsai.dakka.com.cn/v1", "nano-banana-pro", "https://grsai.dakka.com.cn/v1beta/models/nano-banana-pro:generateContent"},
		{"https://grsai.dakka.com.cn/v1/", "nano-banana-pro", "https://grsai.dakka.com.cn/v1beta/models/nano-banana-pro:generateContent"},
		{"https://proxy.example.com/v1beta", "nano-banana-pro", "https://proxy.example.com/v1beta/models/nano-banana-pro:generateContent"},
	}
	for _, item := range cases {
		if got := buildDesktopGeminiURL(item.baseURL, item.model); got != item.want {
			t.Errorf("buildDesktopGeminiURL(%q, %q) = %q, want %q", item.baseURL, item.model, got, item.want)
		}
	}
}

func geminiTestExchange(baseURL string) DesktopCloudExchangeResult {
	return DesktopCloudExchangeResult{
		Task: DesktopCloudGenerationTask{
			ID:          "task-1",
			FinalPrompt: "a red apple",
			RequestMeta: map[string]any{"size": "1024x1024"},
		},
		Model: DesktopCloudGenerationModel{
			BaseURL:   baseURL,
			APIKey:    "test-key",
			ModelName: "gemini-2.5-flash-image",
			Protocol:  "google",
		},
	}
}

func TestRequestDesktopGeminiGenerationSuccess(t *testing.T) {
	pngBytes := []byte{0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n'}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("x-goog-api-key") != "test-key" {
			t.Errorf("missing x-goog-api-key header")
		}
		var request geminiGenerateRequest
		_ = json.NewDecoder(r.Body).Decode(&request)
		if len(request.Contents) != 1 || len(request.Contents[0].Parts) == 0 || request.Contents[0].Parts[0].Text != "a red apple" {
			t.Errorf("unexpected request contents: %+v", request.Contents)
		}
		if request.GenerationConfig == nil || request.GenerationConfig.ImageConfig == nil || request.GenerationConfig.ImageConfig.AspectRatio != "1:1" {
			t.Errorf("unexpected generationConfig: %+v", request.GenerationConfig)
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"candidates": []map[string]any{{
				"content": map[string]any{
					"parts": []map[string]any{
						{"text": "here is your image"},
						{"inlineData": map[string]any{"mimeType": "image/png", "data": base64.StdEncoding.EncodeToString(pngBytes)}},
					},
				},
				"finishReason": "STOP",
			}},
		})
	}))
	defer server.Close()

	imageBytes, mimeType, err := requestDesktopGeminiGeneration(geminiTestExchange(server.URL), DesktopGenerationInput{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if string(imageBytes) != string(pngBytes) {
		t.Errorf("unexpected image bytes")
	}
	if mimeType != "image/png" {
		t.Errorf("mimeType = %q, want image/png", mimeType)
	}
}

func TestRequestDesktopGeminiGenerationBlocked(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{
			"promptFeedback": map[string]any{"blockReason": "SAFETY"},
		})
	}))
	defer server.Close()

	_, _, err := requestDesktopGeminiGeneration(geminiTestExchange(server.URL), DesktopGenerationInput{})
	if err == nil {
		t.Fatalf("expected error for blocked prompt")
	}
}

func TestRequestDesktopGeminiGenerationAPIError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"error": map[string]any{"code": 401, "message": "API key not valid", "status": "UNAUTHENTICATED"},
		})
	}))
	defer server.Close()

	_, _, err := requestDesktopGeminiGeneration(geminiTestExchange(server.URL), DesktopGenerationInput{})
	if err == nil {
		t.Fatalf("expected error for unauthorized response")
	}
	if err.Error() != "API key not valid" {
		t.Errorf("error message = %q, want provider message", err.Error())
	}
}

func TestRequestDesktopGeminiGenerationRetryWithoutImageConfig(t *testing.T) {
	pngBytes := []byte{0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n'}
	requestCount := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requestCount++
		var request geminiGenerateRequest
		_ = json.NewDecoder(r.Body).Decode(&request)
		if request.GenerationConfig != nil && request.GenerationConfig.ImageConfig != nil {
			w.WriteHeader(http.StatusBadRequest)
			_ = json.NewEncoder(w).Encode(map[string]any{
				"error": map[string]any{"code": 400, "message": "Unknown name imageConfig", "status": "INVALID_ARGUMENT"},
			})
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"candidates": []map[string]any{{
				"content": map[string]any{
					"parts": []map[string]any{
						{"inlineData": map[string]any{"mimeType": "image/png", "data": base64.StdEncoding.EncodeToString(pngBytes)}},
					},
				},
			}},
		})
	}))
	defer server.Close()

	imageBytes, _, err := requestDesktopGeminiGeneration(geminiTestExchange(server.URL), DesktopGenerationInput{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if requestCount != 2 {
		t.Errorf("requestCount = %d, want 2 (retry without imageConfig)", requestCount)
	}
	if string(imageBytes) != string(pngBytes) {
		t.Errorf("unexpected image bytes")
	}
}

func TestRequestDesktopGeminiGenerationNoImage(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{
			"candidates": []map[string]any{{
				"content":      map[string]any{"parts": []map[string]any{{"text": "cannot generate"}}},
				"finishReason": "IMAGE_SAFETY",
			}},
		})
	}))
	defer server.Close()

	_, _, err := requestDesktopGeminiGeneration(geminiTestExchange(server.URL), DesktopGenerationInput{})
	if err == nil {
		t.Fatalf("expected error when no image returned")
	}
}
