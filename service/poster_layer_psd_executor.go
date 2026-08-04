package service

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

const posterLayerPSDMaxRevisions = 2

type posterLayerPSDReview struct {
	Status string          `json:"status"`
	Issues []string        `json:"issues"`
	Config json.RawMessage `json:"config"`
}

type posterLayerPSDExecutor struct {
	maxRevisions int
	generate     func(context.Context, string, string, string) ([]byte, error)
	build        func(context.Context, string, string, string, string) error
	review       func(context.Context, string, string, []byte, string, string) (posterLayerPSDReview, error)
}

func newPosterLayerPSDExecutor() posterLayerPSDExecutor {
	return posterLayerPSDExecutor{
		maxRevisions: posterLayerPSDMaxRevisions,
		generate:     generatePSDLayerConfig,
		build:        runPosterLayerPSDBuild,
		review:       reviewPSDLayerPreview,
	}
}

func (executor posterLayerPSDExecutor) Execute(ctx context.Context, taskDir string, sourcePath string, basename string, modelName string) error {
	configJSON, err := executor.generate(ctx, sourcePath, basename, modelName)
	if err != nil {
		return err
	}
	configPath := filepath.Join(taskDir, "layers.json")
	previewPath := filepath.Join(taskDir, basename+"_layered_preview.png")
	for revision := 0; ; revision++ {
		if err := os.WriteFile(configPath, configJSON, 0644); err != nil {
			return err
		}
		if err := executor.build(ctx, sourcePath, configPath, taskDir, basename); err != nil {
			return err
		}
		review, err := executor.review(ctx, sourcePath, previewPath, configJSON, basename, modelName)
		if err != nil {
			return err
		}
		switch strings.ToLower(strings.TrimSpace(review.Status)) {
		case "pass":
			return nil
		case "revise":
			if revision >= executor.maxRevisions {
				return safeMessageError{message: fmt.Sprintf("PSD 预览校验仍未通过：%s", strings.Join(review.Issues, "；"))}
			}
			if len(review.Config) == 0 || string(review.Config) == "null" {
				return safeMessageError{message: "PSD 预览需要修正，但模型没有返回图层配置"}
			}
			configJSON, err = normalizePSDLayerConfig(string(review.Config), basename)
			if err != nil {
				return err
			}
		default:
			return safeMessageError{message: "PSD 预览校验返回了未知状态"}
		}
	}
}

func runPosterLayerPSDBuild(ctx context.Context, sourcePath string, configPath string, taskDir string, basename string) error {
	pythonPath, pythonPathDir, err := ensurePythonRuntime()
	if err != nil {
		return err
	}
	scriptPath, err := posterLayerScriptPath()
	if err != nil {
		return err
	}
	cmd := exec.CommandContext(ctx, pythonPath, scriptPath, "--source", sourcePath, "--config", configPath, "--out", taskDir, "--basename", basename)
	cmd.Env = append(os.Environ(), "PATH="+pythonPathDir+string(os.PathListSeparator)+os.Getenv("PATH"))
	var output bytes.Buffer
	cmd.Stdout = &output
	cmd.Stderr = &output
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("PSD 脚本执行失败：%s", psdCommandError(err, output.String(), pythonPath, scriptPath, configPath, taskDir))
	}
	return validatePSDOutputs(taskDir, basename)
}

func posterLayerPSDSkillPrompt() (string, error) {
	root, err := posterLayerSkillRoot()
	if err != nil {
		return "", err
	}
	paths := []string{
		filepath.Join(root, "SKILL.md"),
		filepath.Join(root, "references", "config-schema.md"),
		filepath.Join(root, "assets", "plant_app_config.example.json"),
	}
	sections := make([]string, 0, len(paths))
	for _, path := range paths {
		content, err := os.ReadFile(path)
		if err != nil {
			return "", safeMessageError{message: "poster-layer-psd skill 资源不完整"}
		}
		sections = append(sections, string(content))
	}
	return "你正在执行内置 poster-layer-psd skill。必须遵循下面的工作流、配置 Schema 和示例，只返回当前步骤要求的严格 JSON。\n\n" + strings.Join(sections, "\n\n"), nil
}

func reviewPSDLayerPreview(ctx context.Context, sourcePath string, previewPath string, configJSON []byte, basename string, modelName string) (posterLayerPSDReview, error) {
	skillPrompt, err := posterLayerPSDSkillPrompt()
	if err != nil {
		return posterLayerPSDReview{}, err
	}
	sourceBytes, err := os.ReadFile(sourcePath)
	if err != nil {
		return posterLayerPSDReview{}, err
	}
	previewBytes, err := os.ReadFile(previewPath)
	if err != nil {
		return posterLayerPSDReview{}, err
	}
	prompt := `请执行 skill 的预览检查步骤。第一张图片是原图，第二张图片是脚本生成的图层合成预览。
检查主要元素是否缺失、坐标是否错位、文字或图标是否裁切、背景清理是否破坏布局。
如果预览已经可交付，返回：{"status":"pass","issues":[],"config":null}。
如果需要修正，返回：{"status":"revise","issues":["问题"],"config":{完整修正后的配置}}。
config 必须是完整对象，严格符合 skill 的 Config Schema，并保持 basename 为 ` + basename + `。
当前配置：
` + string(configJSON)
	content, err := requestPSDResponseJSON(ctx, modelName, skillPrompt, []psdResponseContent{
		{Type: "input_text", Text: prompt},
		{Type: "input_image", ImageURL: imageDataURL(sourceBytes)},
		{Type: "input_image", ImageURL: imageDataURL(previewBytes)},
	})
	if err != nil {
		return posterLayerPSDReview{}, err
	}
	start := strings.Index(content, "{")
	end := strings.LastIndex(content, "}")
	if start < 0 || end <= start {
		return posterLayerPSDReview{}, safeMessageError{message: "文本模型没有返回有效的 PSD 预览校验 JSON"}
	}
	var review posterLayerPSDReview
	if err := json.Unmarshal([]byte(content[start:end+1]), &review); err != nil {
		return posterLayerPSDReview{}, safeMessageError{message: "文本模型返回的 PSD 预览校验 JSON 无法解析"}
	}
	review.Status = strings.ToLower(strings.TrimSpace(review.Status))
	if review.Status != "pass" && review.Status != "revise" {
		return posterLayerPSDReview{}, safeMessageError{message: "文本模型返回的 PSD 预览校验状态无效"}
	}
	return review, nil
}

func imageDataURL(data []byte) string {
	return "data:" + http.DetectContentType(data) + ";base64," + base64.StdEncoding.EncodeToString(data)
}
