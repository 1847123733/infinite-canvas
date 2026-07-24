package service

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func TestBuildDesktopGrsaiURL(t *testing.T) {
	cases := []struct {
		baseURL string
		path    string
		want    string
	}{
		{"https://grsai.dakka.com.cn", "/v1/api/generate", "https://grsai.dakka.com.cn/v1/api/generate"},
		{"https://grsai.dakka.com.cn/", "/v1/api/generate", "https://grsai.dakka.com.cn/v1/api/generate"},
		{"https://grsai.dakka.com.cn/v1", "/v1/api/generate", "https://grsai.dakka.com.cn/v1/api/generate"},
		{"https://grsai.dakka.com.cn/v1/", "/v1/api/generate", "https://grsai.dakka.com.cn/v1/api/generate"},
		{"https://grsai.dakka.com.cn/v1/api", "/v1/api/generate", "https://grsai.dakka.com.cn/v1/api/generate"},
		{"https://grsaiapi.com/v1beta", "/v1/api/result", "https://grsaiapi.com/v1/api/result"},
		{"https://grsaiapi.com", "/v1/api/result", "https://grsaiapi.com/v1/api/result"},
	}
	for _, item := range cases {
		if got := buildDesktopGrsaiURL(item.baseURL, item.path); got != item.want {
			t.Errorf("buildDesktopGrsaiURL(%q, %q) = %q, want %q", item.baseURL, item.path, got, item.want)
		}
	}
}

func grsaiTestExchange(baseURL string) DesktopCloudExchangeResult {
	return DesktopCloudExchangeResult{
		Task: DesktopCloudGenerationTask{
			ID:          "task-1",
			FinalPrompt: "a red apple",
			RequestMeta: map[string]any{"size": "1024x1024"},
		},
		Model: DesktopCloudGenerationModel{
			BaseURL:   baseURL,
			APIKey:    "test-key",
			ModelName: "nano-banana-pro",
			Protocol:  "grsai",
		},
	}
}

func setGrsaiPollTiming(t *testing.T, interval time.Duration, timeout time.Duration) {
	t.Helper()
	savedInterval, savedTimeout := grsaiPollInterval, grsaiPollTimeout
	grsaiPollInterval, grsaiPollTimeout = interval, timeout
	t.Cleanup(func() {
		grsaiPollInterval, grsaiPollTimeout = savedInterval, savedTimeout
	})
}

func TestRequestDesktopGrsaiGenerationAsyncSuccess(t *testing.T) {
	setGrsaiPollTiming(t, time.Millisecond, time.Minute)
	pngBytes := []byte{0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n'}
	var pollCount atomic.Int32
	mux := http.NewServeMux()
	server := httptest.NewServer(mux)
	defer server.Close()

	mux.HandleFunc("/v1/api/generate", func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer test-key" {
			t.Errorf("missing Authorization header")
		}
		var request grsaiGenerateRequest
		_ = json.NewDecoder(r.Body).Decode(&request)
		if request.Model != "nano-banana-pro" {
			t.Errorf("model = %q, want nano-banana-pro", request.Model)
		}
		if !strings.HasPrefix(request.Prompt, "a red apple") || !strings.Contains(request.Prompt, "mask") {
			t.Errorf("unexpected prompt: %q", request.Prompt)
		}
		if request.ReplyType != "async" {
			t.Errorf("replyType = %q, want async", request.ReplyType)
		}
		if request.AspectRatio != "1:1" {
			t.Errorf("aspectRatio = %q, want 1:1", request.AspectRatio)
		}
		if len(request.Images) != 2 {
			t.Errorf("images length = %d, want 2 (reference + mask)", len(request.Images))
		}
		for _, item := range request.Images {
			if !strings.HasPrefix(item, "data:image/png;base64,") {
				t.Errorf("image is not a base64 data URI: %q", item[:min(len(item), 40)])
			}
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"id": "job-1", "status": "running"})
	})
	mux.HandleFunc("/v1/api/result", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Get("id") != "job-1" {
			t.Errorf("result id = %q, want job-1", r.URL.Query().Get("id"))
		}
		if r.Header.Get("Authorization") != "Bearer test-key" {
			t.Errorf("missing Authorization header on result request")
		}
		if pollCount.Add(1) == 1 {
			_ = json.NewEncoder(w).Encode(map[string]any{"id": "job-1", "status": "running", "progress": 50})
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"id":      "job-1",
			"status":  "succeeded",
			"results": []map[string]any{{"url": server.URL + "/image.png"}},
		})
	})
	mux.HandleFunc("/image.png", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "image/png")
		_, _ = w.Write(pngBytes)
	})

	input := DesktopGenerationInput{
		References: []DesktopReferenceImage{{Filename: "ref.png", ContentType: "image/png", Bytes: pngBytes}},
		Mask:       &DesktopReferenceImage{Filename: "mask.png", ContentType: "image/png", Bytes: pngBytes},
	}
	imageBytes, mimeType, err := requestDesktopGrsaiGeneration(grsaiTestExchange(server.URL), input)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if string(imageBytes) != string(pngBytes) {
		t.Errorf("unexpected image bytes")
	}
	if mimeType != "image/png" {
		t.Errorf("mimeType = %q, want image/png", mimeType)
	}
	if pollCount.Load() != 2 {
		t.Errorf("pollCount = %d, want 2", pollCount.Load())
	}
}

func TestRequestDesktopGrsaiGenerationImmediateResult(t *testing.T) {
	setGrsaiPollTiming(t, time.Millisecond, time.Minute)
	pngBytes := []byte{0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n'}
	mux := http.NewServeMux()
	server := httptest.NewServer(mux)
	defer server.Close()

	mux.HandleFunc("/v1/api/generate", func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{
			"id":      "job-2",
			"status":  "succeeded",
			"results": []map[string]any{{"url": server.URL + "/image.png"}},
		})
	})
	mux.HandleFunc("/v1/api/result", func(w http.ResponseWriter, r *http.Request) {
		t.Errorf("result endpoint should not be called when generate returns final result")
	})
	mux.HandleFunc("/image.png", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "image/png")
		_, _ = w.Write(pngBytes)
	})

	imageBytes, _, err := requestDesktopGrsaiGeneration(grsaiTestExchange(server.URL), DesktopGenerationInput{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if string(imageBytes) != string(pngBytes) {
		t.Errorf("unexpected image bytes")
	}
}

func TestRequestDesktopGrsaiGenerationFailed(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]any{"id": "job-3", "status": "failed", "error": "generate failed"})
	}))
	defer server.Close()

	_, _, err := requestDesktopGrsaiGeneration(grsaiTestExchange(server.URL), DesktopGenerationInput{})
	if err == nil {
		t.Fatalf("expected error for failed generation")
	}
	if err.Error() != "generate failed" {
		t.Errorf("error message = %q, want provider message", err.Error())
	}
}

func TestRequestDesktopGrsaiGenerationViolation(t *testing.T) {
	setGrsaiPollTiming(t, time.Millisecond, time.Minute)
	mux := http.NewServeMux()
	server := httptest.NewServer(mux)
	defer server.Close()

	mux.HandleFunc("/v1/api/generate", func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{"id": "job-4", "status": "running"})
	})
	mux.HandleFunc("/v1/api/result", func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{"id": "job-4", "status": "violation", "error": "nsfw"})
	})

	_, _, err := requestDesktopGrsaiGeneration(grsaiTestExchange(server.URL), DesktopGenerationInput{})
	if err == nil {
		t.Fatalf("expected error for violation status")
	}
	if !strings.Contains(err.Error(), "安全策略") {
		t.Errorf("error message = %q, want safety message", err.Error())
	}
}

func TestRequestDesktopGrsaiGenerationTimeout(t *testing.T) {
	setGrsaiPollTiming(t, time.Millisecond, 30*time.Millisecond)
	mux := http.NewServeMux()
	server := httptest.NewServer(mux)
	defer server.Close()

	mux.HandleFunc("/v1/api/generate", func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{"id": "job-5", "status": "running"})
	})
	mux.HandleFunc("/v1/api/result", func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{"id": "job-5", "status": "running", "progress": 10})
	})

	_, _, err := requestDesktopGrsaiGeneration(grsaiTestExchange(server.URL), DesktopGenerationInput{})
	if err == nil {
		t.Fatalf("expected timeout error")
	}
	if !strings.Contains(err.Error(), "超时") {
		t.Errorf("error message = %q, want timeout message", err.Error())
	}
}
