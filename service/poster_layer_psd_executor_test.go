package service

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestPosterLayerPSDExecutorRebuildsRevisedConfigUntilPreviewPasses(t *testing.T) {
	taskDir := t.TempDir()
	builds := [][]byte{}
	reviews := 0
	executor := posterLayerPSDExecutor{
		maxRevisions: 2,
		generate: func(context.Context, string, string, string) ([]byte, error) {
			return []byte(`{"basename":"psd_test","background":{"mode":"source"},"layers":[{"name":"01_initial","box":[0,0,10,10],"extract":"raw"}]}`), nil
		},
		build: func(_ context.Context, _ string, configPath string, _ string, _ string) error {
			config, err := os.ReadFile(configPath)
			if err != nil {
				return err
			}
			builds = append(builds, config)
			return os.WriteFile(filepath.Join(taskDir, "psd_test_layered_preview.png"), []byte("preview"), 0644)
		},
		review: func(_ context.Context, _, _ string, _ []byte, _, _ string) (posterLayerPSDReview, error) {
			reviews++
			if reviews == 1 {
				return posterLayerPSDReview{
					Status: "revise",
					Issues: []string{"标题坐标需要修正"},
					Config: json.RawMessage(`{"basename":"wrong","background":{"mode":"source"},"layers":[{"name":"01_revised","box":[1,1,9,9],"extract":"raw"}]}`),
				}, nil
			}
			return posterLayerPSDReview{Status: "pass"}, nil
		},
	}

	if err := executor.Execute(context.Background(), taskDir, "source.png", "psd_test", "gpt-5.5"); err != nil {
		t.Fatalf("Execute returned error: %v", err)
	}
	if len(builds) != 2 || reviews != 2 {
		t.Fatalf("builds = %d, reviews = %d, want 2 and 2", len(builds), reviews)
	}
	var finalConfig psdLayerConfig
	configBytes, err := os.ReadFile(filepath.Join(taskDir, "layers.json"))
	if err != nil {
		t.Fatalf("read final config: %v", err)
	}
	if err := json.Unmarshal(configBytes, &finalConfig); err != nil {
		t.Fatalf("decode final config: %v", err)
	}
	if finalConfig.Basename != "psd_test" || len(finalConfig.Layers) != 1 || finalConfig.Layers[0].Name != "01_revised" {
		t.Fatalf("final config = %#v", finalConfig)
	}
}

func TestPosterLayerPSDExecutorStopsAfterRevisionLimit(t *testing.T) {
	taskDir := t.TempDir()
	builds := 0
	executor := posterLayerPSDExecutor{
		maxRevisions: 1,
		generate: func(context.Context, string, string, string) ([]byte, error) {
			return []byte(`{"basename":"psd_test","background":{"mode":"source"},"layers":[{"name":"01_initial","box":[0,0,10,10],"extract":"raw"}]}`), nil
		},
		build: func(context.Context, string, string, string, string) error {
			builds++
			return nil
		},
		review: func(context.Context, string, string, []byte, string, string) (posterLayerPSDReview, error) {
			return posterLayerPSDReview{
				Status: "revise",
				Issues: []string{"仍然存在坐标错误"},
				Config: json.RawMessage(`{"basename":"psd_test","background":{"mode":"source"},"layers":[{"name":"01_revised","box":[1,1,9,9],"extract":"raw"}]}`),
			}, nil
		},
	}

	err := executor.Execute(context.Background(), taskDir, "source.png", "psd_test", "gpt-5.5")
	if err == nil || !strings.Contains(err.Error(), "预览校验仍未通过") {
		t.Fatalf("error = %v, want revision limit error", err)
	}
	if builds != 2 {
		t.Fatalf("builds = %d, want 2", builds)
	}
}
