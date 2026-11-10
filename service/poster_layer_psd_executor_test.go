package service

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestPosterLayerPSDExecutorAppliesLocalChangesWithOneReview(t *testing.T) {
	taskDir := t.TempDir()
	builds := [][]byte{}
	reviews := 0
	executor := posterLayerPSDExecutor{
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
					Status:  "revise",
					Issues:  []string{"标题坐标需要修正"},
					Changes: []posterLayerPSDChange{{Name: "01_initial", Layers: []json.RawMessage{json.RawMessage(`{"name":"01_revised","box":[1,1,9,9],"extract":"raw"}`)}}},
				}, nil
			}
			return posterLayerPSDReview{Status: "pass"}, nil
		},
	}

	if _, ok := executor.Execute(context.Background(), taskDir, "source.png", "psd_test", "gpt-5.5").(posterLayerPSDWarning); !ok {
		t.Fatal("expected an advisory after applying changes")
	}
	if len(builds) != 2 || reviews != 1 {
		t.Fatalf("builds = %d, reviews = %d, want 2 and 1", len(builds), reviews)
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

func TestPosterLayerPSDExecutorPreservesOutputsOnUnchangedRevision(t *testing.T) {
	taskDir := t.TempDir()
	builds := 0
	executor := posterLayerPSDExecutor{
		generate: func(context.Context, string, string, string) ([]byte, error) {
			return []byte(`{"basename":"psd_test","background":{"mode":"source"},"layers":[{"name":"01_initial","box":[0,0,10,10],"extract":"raw"}]}`), nil
		},
		build: func(context.Context, string, string, string, string) error {
			builds++
			return nil
		},
		review: func(context.Context, string, string, []byte, string, string) (posterLayerPSDReview, error) {
			return posterLayerPSDReview{
				Status:  "revise",
				Issues:  []string{"仍然存在坐标错误"},
				Changes: []posterLayerPSDChange{{Name: "01_initial", Layers: []json.RawMessage{json.RawMessage(`{"name":"01_initial","box":[0,0,10,10],"extract":"raw"}`)}}},
			}, nil
		},
	}

	err := executor.Execute(context.Background(), taskDir, "source.png", "psd_test", "gpt-5.5")
	if _, ok := err.(posterLayerPSDWarning); !ok || !strings.Contains(err.Error(), "没有产生任何图层变化") {
		t.Fatalf("error = %v, want advisory about unchanged revision", err)
	}
	if builds != 1 {
		t.Fatalf("builds = %d, want 1", builds)
	}
}

func TestPSDLayerChangesSplitOneLayerAndPreserveNeighbors(t *testing.T) {
	config := []byte(`{"background":{"mode":"solid","fill":[255,255,255]},"layers":[{"name":"title","box":[0,0,50,10]},{"name":"button","box":[0,20,50,40]},{"name":"photo","box":[0,50,50,100],"extract":"photo"}]}`)
	updated, err := applyPSDLayerChanges(config, []posterLayerPSDChange{{Name: "button", Layers: []json.RawMessage{
		json.RawMessage(`{"name":"button_background","box":[0,20,50,40],"type":"solid"}`),
		json.RawMessage(`{"name":"button_label","box":[5,22,45,38],"extract":"nonbg"}`),
	}}}, "psd_test")
	if err != nil {
		t.Fatal(err)
	}
	var result psdLayerConfig
	if err := json.Unmarshal(updated, &result); err != nil {
		t.Fatal(err)
	}
	if len(result.Layers) != 4 || result.Layers[0].Name != "title" || result.Layers[1].Name != "button_background" || result.Layers[2].Name != "button_label" || result.Layers[3].Name != "photo" || !strings.Contains(string(result.Background), "solid") {
		t.Fatalf("unexpected layers after split: %s", updated)
	}
}
