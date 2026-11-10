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
	"time"
)

type posterLayerPSDReview struct {
	Status  string                 `json:"status"`
	Issues  []string               `json:"issues"`
	Changes []posterLayerPSDChange `json:"changes"`
}

type posterLayerPSDExecutor struct {
	progress func(string)
	generate func(context.Context, string, string, string) ([]byte, error)
	build    func(context.Context, string, string, string, string) error
	review   func(context.Context, string, string, []byte, string, string) (posterLayerPSDReview, error)
}

func newPosterLayerPSDExecutor() posterLayerPSDExecutor {
	return posterLayerPSDExecutor{
		generate: generatePSDLayerConfig,
		build:    runPosterLayerPSDBuild,
		review:   reviewPSDLayerPreview,
	}
}

func (executor posterLayerPSDExecutor) Execute(ctx context.Context, taskDir string, sourcePath string, basename string, modelName string) error {
	if executor.progress != nil {
		executor.progress("正在识别文字与独立元素")
	}
	configJSON, err := executor.generate(ctx, sourcePath, basename, modelName)
	if err != nil {
		return err
	}
	configPath := filepath.Join(taskDir, "layers.json")
	previewPath := filepath.Join(taskDir, basename+"_layered_preview.png")
	var revisionIssues []string
	for revision := 0; revision < 2; revision++ {
		if executor.progress != nil {
			executor.progress("正在导出图层与 PSD")
		}
		if err := os.WriteFile(configPath, configJSON, 0644); err != nil {
			return err
		}
		if err := executor.build(ctx, sourcePath, configPath, taskDir, basename); err != nil {
			return err
		}
		if revision == 1 {
			return posterLayerPSDWarning("已按检查建议自动修正，请核对图层预览：" + strings.Join(revisionIssues, "；"))
		}
		if executor.progress != nil {
			executor.progress("正在检查独立图层")
		}
		reviewCtx, cancel := context.WithTimeout(ctx, 90*time.Second)
		review, err := executor.review(reviewCtx, sourcePath, previewPath, configJSON, basename, modelName)
		cancel()
		if err != nil {
			if ctx.Err() != nil {
				return ctx.Err()
			}
			return posterLayerPSDWarning("PSD 已生成，自动检查未完成，请核对图层预览：" + safeTaskError(err))
		}
		switch strings.ToLower(strings.TrimSpace(review.Status)) {
		case "pass":
			if len(review.Issues) > 0 {
				return posterLayerPSDWarning(strings.Join(review.Issues, "；"))
			}
			return nil
		case "warn":
			return posterLayerPSDWarning("请核对图层预览：" + strings.Join(review.Issues, "；"))
		case "revise":
			revisionIssues = review.Issues
			configJSON, err = applyPSDLayerChanges(configJSON, review.Changes, basename)
			if err != nil {
				return posterLayerPSDWarning("PSD 已生成，自动修正未应用，请核对：" + strings.Join(review.Issues, "；") + "；" + safeTaskError(err))
			}
		default:
			return safeMessageError{message: "PSD 预览校验返回了未知状态"}
		}
	}
	return nil
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
	cmd.Env = append(os.Environ(), "PATH="+pythonPathDir+string(os.PathListSeparator)+os.Getenv("PATH"), "PYTHONUTF8=1")
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
	}
	sections := make([]string, 0, len(paths))
	for _, path := range paths {
		content, err := os.ReadFile(path)
		if err != nil {
			return "", safeMessageError{message: "poster-layer-psd skill 资源不完整"}
		}
		sections = append(sections, string(content))
	}
	return "你正在执行内置 poster-layer-psd skill。必须遵循下面的工作流和配置 Schema，只返回当前步骤要求的严格 JSON。\n\n" + strings.Join(sections, "\n\n"), nil
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
	prompt := `请执行 skill 的预览检查步骤。第一张图片是原图，第二张图片是脚本生成的图层合成预览，后续图片是按 manifest 从底到顶编号的独立图层缩略图，每页最多 12 层，000 为背景。棋盘格表示透明区域，缩略图已缩放居中，坐标以配置为准。
先逐区域对照原图清点独立元素，再结合配置和每层实际缩略图检查拆层粒度。文字块、图标、照片、背景容器必须独立；卡片标题、正文、价格、按钮背景、按钮文字、导航图标、导航标签不能打包在同一层。检查 raw/photo 裁剪是否把整张卡片或多个元素留在一起，安全边距是否带入相邻文字或图标，不要只凭图层名称判断已经独立。
再检查主要元素是否缺失、坐标是否错位、文字或图标是否裁切、背景清理是否破坏布局。合成图相似不代表分层合格，不能因背景保留原图而忽略缺失图层，也不能为了减少层数而合并元素。
partition 模式下，下层/背景在上层不透明元素的位置有透明孔洞是预期行为，不能当作缺失笔画或要求补绘。文字应在对应的上层中完整；原位合成需保持原图外观。
semantic-ui 必须采用相反标准：卡片/按钮背景是完整不透明容器，不能有图标形状孔洞或残留文字。水滴与圆底、加号与圆底等是完整图标，不应重复提取内部主体；旁边文字必须独立。若圆底范围被截断、图标内部透明或卡片仍带其他内容，应修正相关图层，不因原位合成相似而通过。
手机状态栏（时间、信号、Wi-Fi、电池）可整体保留；同一图标内部的点、光晕或装饰纹理无需细拆。这些次要细节不要触发自动修正。
只检查本脚本能完成的裁剪、元素独立性和坐标问题；复杂遮挡、纹理背景上的文字抠图、主体被遮住的内容无法靠矩形裁剪还原，不要反复要求重生成配置。
合格时返回：{"status":"pass","issues":[],"changes":[]}。
有脚本无法解决的问题时返回：{"status":"warn","issues":["具体限制与建议"],"changes":[]}，保留产物供用户检查。
有可修正的业务元素混层、缺失或裁切时，只返回局部替换：{"status":"revise","issues":["问题"],"changes":[{"name":"现有图层名","layers":[完整替换图层配置]}]}。
每项 changes 在原图层位置用 layers 替换该层，一层可以替换为多层；空 layers 表示删除。补充缺失元素时，可保留该原层并在 layers 内增加新层。图层必须符合 skill 的 Config Schema，name 不得重复，背景配置保持不变。
一次列出所有可修正问题并给出精确替换；不要输出完整配置，也不要返回与原配置相同的替换。只执行一轮检查和一次局部修正，不会再次请求模型。
issues 仅列出需要修正或用户手工处理的问题，不复述已经通过的检查；使用简短中文。
当前配置：
` + string(configJSON)
	input := []psdResponseContent{
		{Type: "input_text", Text: prompt},
		{Type: "input_image", ImageURL: imageDataURL(sourceBytes)},
		{Type: "input_image", ImageURL: imageDataURL(previewBytes)},
	}
	contactSheets, err := filepath.Glob(filepath.Join(filepath.Dir(previewPath), basename+"_layers_contact_sheet_*.png"))
	if err != nil {
		return posterLayerPSDReview{}, err
	}
	if len(contactSheets) == 0 {
		return posterLayerPSDReview{}, safeMessageError{message: "缺少 PSD 独立图层预览"}
	}
	for _, path := range contactSheets {
		data, err := os.ReadFile(path)
		if err != nil {
			return posterLayerPSDReview{}, err
		}
		input = append(input, psdResponseContent{Type: "input_image", ImageURL: imageDataURL(data)})
	}
	content, err := requestPSDResponseJSON(ctx, modelName, skillPrompt, input)
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
	if review.Status != "pass" && review.Status != "revise" && review.Status != "warn" {
		return posterLayerPSDReview{}, safeMessageError{message: "文本模型返回的 PSD 预览校验状态无效"}
	}
	return review, nil
}

func imageDataURL(data []byte) string {
	return "data:" + http.DetectContentType(data) + ";base64," + base64.StdEncoding.EncodeToString(data)
}
