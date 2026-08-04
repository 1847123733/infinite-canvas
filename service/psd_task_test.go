package service

import (
	"context"
	"encoding/json"
	"image"
	"image/color"
	"image/png"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/basketikun/infinite-canvas/config"
	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

func TestPosterLayerPSDModelCallsUseSkillAwareResponsesAPI(t *testing.T) {
	const modelName = "responses-only-model"
	requestCount := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requestCount++
		if r.URL.Path != "/v1/responses" {
			t.Errorf("request path = %q, want /v1/responses", r.URL.Path)
		}
		if r.Header.Get("Authorization") != "Bearer test-key" {
			t.Errorf("authorization = %q", r.Header.Get("Authorization"))
		}

		var payload struct {
			Model string `json:"model"`
			Input []struct {
				Role    string          `json:"role"`
				Content json.RawMessage `json:"content"`
			} `json:"input"`
			Reasoning struct {
				Effort string `json:"effort"`
			} `json:"reasoning"`
			Text struct {
				Format struct {
					Type string `json:"type"`
				} `json:"format"`
			} `json:"text"`
			Messages        any `json:"messages"`
			ReasoningEffort any `json:"reasoning_effort"`
			ResponseFormat  any `json:"response_format"`
		}
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			t.Errorf("decode request: %v", err)
		}
		if payload.Model != modelName {
			t.Errorf("model = %q, want %q", payload.Model, modelName)
		}
		if len(payload.Input) != 2 || payload.Input[0].Role != "system" || payload.Input[1].Role != "user" {
			t.Errorf("input roles = %#v", payload.Input)
		} else {
			var systemPrompt string
			if err := json.Unmarshal(payload.Input[0].Content, &systemPrompt); err != nil {
				t.Errorf("decode system prompt: %v", err)
			} else if !strings.Contains(systemPrompt, "Poster Layer PSD") || !strings.Contains(systemPrompt, "Config Schema") {
				t.Errorf("system prompt does not include bundled skill resources")
			}
			var userContent []struct {
				Type     string `json:"type"`
				Text     string `json:"text"`
				ImageURL string `json:"image_url"`
			}
			if err := json.Unmarshal(payload.Input[1].Content, &userContent); err != nil {
				t.Errorf("decode user content: %v", err)
			} else {
				imageCount := 0
				for _, item := range userContent {
					if item.Type == "input_image" && item.ImageURL != "" {
						imageCount++
					}
				}
				wantImages := 1
				if requestCount == 2 {
					wantImages = 2
				}
				if imageCount != wantImages {
					t.Errorf("request %d image count = %d, want %d", requestCount, imageCount, wantImages)
				}
			}
		}
		if payload.Reasoning.Effort != "high" {
			t.Errorf("reasoning effort = %q, want high", payload.Reasoning.Effort)
		}
		if payload.Text.Format.Type != "json_object" {
			t.Errorf("text format = %q, want json_object", payload.Text.Format.Type)
		}
		if payload.Messages != nil || payload.ReasoningEffort != nil || payload.ResponseFormat != nil {
			t.Errorf("chat-only fields were sent: messages=%v reasoning_effort=%v response_format=%v", payload.Messages, payload.ReasoningEffort, payload.ResponseFormat)
		}

		w.Header().Set("Content-Type", "application/json")
		if requestCount == 1 {
			_, _ = w.Write([]byte(`{"output":[{"type":"message","content":[{"type":"output_text","text":"{\"basename\":\"ignored\",\"background\":{\"mode\":\"source\"},\"layers\":[{\"name\":\"01_title\",\"box\":[0,0,1,1],\"extract\":\"raw\"}]}"}]}]}`))
			return
		}
		_, _ = w.Write([]byte(`{"output":[{"type":"message","content":[{"type":"output_text","text":"{\"status\":\"revise\",\"issues\":[\"标题需要扩大边界\"],\"config\":{\"basename\":\"ignored\",\"background\":{\"mode\":\"source\"},\"layers\":[{\"name\":\"01_title_revised\",\"box\":[0,0,1,1],\"extract\":\"raw\"}]}}"}]}]}`))
	}))
	defer server.Close()

	tempDir := t.TempDir()
	config.Cfg.StorageDriver = "sqlite"
	config.Cfg.DatabaseDSN = "file:psd-responses-test?mode=memory&cache=shared"
	workDir, err := os.Getwd()
	if err != nil {
		t.Fatalf("read working directory: %v", err)
	}
	config.Cfg.ResourceDir = filepath.Dir(workDir)
	_, err = repository.SaveSettings(model.Settings{
		Private: model.PrivateSetting{Channels: []model.ModelChannel{{
			Protocol: "openai",
			BaseURL:  server.URL,
			APIKey:   "test-key",
			Models:   []string{modelName},
			Weight:   1,
			Enabled:  true,
		}}},
	}, "2026-08-03T00:00:00Z")
	if err != nil {
		t.Fatalf("save settings: %v", err)
	}

	sourcePath := filepath.Join(tempDir, "source.png")
	file, err := os.Create(sourcePath)
	if err != nil {
		t.Fatalf("create source image: %v", err)
	}
	sourceImage := image.NewRGBA(image.Rect(0, 0, 1, 1))
	sourceImage.Set(0, 0, color.White)
	if err := png.Encode(file, sourceImage); err != nil {
		_ = file.Close()
		t.Fatalf("encode source image: %v", err)
	}
	if err := file.Close(); err != nil {
		t.Fatalf("close source image: %v", err)
	}

	result, err := generatePSDLayerConfig(context.Background(), sourcePath, "psd_test", modelName)
	if err != nil {
		t.Fatalf("generatePSDLayerConfig returned error: %v", err)
	}
	var layerConfig psdLayerConfig
	if err := json.Unmarshal(result, &layerConfig); err != nil {
		t.Fatalf("decode layer config: %v", err)
	}
	if layerConfig.Basename != "psd_test" || len(layerConfig.Layers) != 1 || layerConfig.Layers[0].Name != "01_title" {
		t.Fatalf("layer config = %#v", layerConfig)
	}

	review, err := reviewPSDLayerPreview(context.Background(), sourcePath, sourcePath, result, "psd_test", modelName)
	if err != nil {
		t.Fatalf("reviewPSDLayerPreview returned error: %v", err)
	}
	if review.Status != "revise" || len(review.Issues) != 1 || len(review.Config) == 0 {
		t.Fatalf("review = %#v", review)
	}
	if requestCount != 2 {
		t.Fatalf("request count = %d, want 2", requestCount)
	}
}
