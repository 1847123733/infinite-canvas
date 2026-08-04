package service

import (
	"archive/zip"
	"bytes"
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"image"
	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/basketikun/infinite-canvas/config"
	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

const (
	psdTaskRootName     = "psd-tasks"
	psdSkillPath        = ".agents/skills/poster-layer-psd"
	psdScriptPath       = "scripts/poster_layer_psd.py"
	psdMaxUploadBytes   = 30 << 20
	psdTaskHTTPTimeout  = 1200 * time.Second
	psdPythonOutputTail = 4000
	psdTaskMetaName     = "task.json"
)

var psdTasks = &psdTaskStore{items: map[string]*psdTaskState{}}

type psdTaskState struct {
	taskDir    string
	sourcePath string
	basename   string
	cancel     context.CancelFunc
	task       model.PSDTask
}

type psdTaskStore struct {
	mu    sync.RWMutex
	items map[string]*psdTaskState
}

type psdLayerConfig struct {
	Basename   string          `json:"basename,omitempty"`
	Background json.RawMessage `json:"background,omitempty"`
	Layers     []struct {
		Name string `json:"name"`
		Box  []int  `json:"box"`
	} `json:"layers"`
}

type psdResponseInput struct {
	Role    string `json:"role"`
	Content any    `json:"content"`
}

type psdResponseContent struct {
	Type     string `json:"type"`
	Text     string `json:"text,omitempty"`
	ImageURL string `json:"image_url,omitempty"`
}

func CreatePSDTask(file multipart.File, header *multipart.FileHeader) (model.PSDTask, error) {
	if file == nil || header == nil {
		return model.PSDTask{}, safeMessageError{message: "请选择图片"}
	}
	if header.Size > psdMaxUploadBytes {
		return model.PSDTask{}, safeMessageError{message: "图片不能超过 30MB"}
	}
	taskID := newTaskID()
	taskDir := filepath.Join(psdTaskRoot(), taskID)
	if err := os.MkdirAll(taskDir, 0755); err != nil {
		return model.PSDTask{}, err
	}
	sourceName := safeFileName(header.Filename)
	sourcePath := filepath.Join(taskDir, "source"+strings.ToLower(filepath.Ext(sourceName)))
	if sourcePath == filepath.Join(taskDir, "source") {
		sourcePath += ".png"
	}
	if err := saveUploadedFile(file, sourcePath); err != nil {
		return model.PSDTask{}, err
	}
	modelName, err := defaultPSDTextModel()
	if err != nil {
		return model.PSDTask{}, err
	}
	nowText := now()
	ctx, cancel := context.WithCancel(context.Background())
	state := &psdTaskState{
		taskDir:    taskDir,
		sourcePath: sourcePath,
		basename:   "psd_" + taskID,
		cancel:     cancel,
		task: model.PSDTask{
			ID:         taskID,
			Status:     model.PSDTaskStatusPending,
			SourceName: sourceName,
			Model:      modelName,
			StartedAt:  nowText,
			Files:      psdTaskFiles(taskID),
		},
	}
	psdTasks.mu.Lock()
	psdTasks.items[taskID] = state
	psdTasks.mu.Unlock()
	_ = persistPSDTaskState(state)
	go runPSDTask(ctx, taskID)
	return clonePSDTask(state.task), nil
}

func GetPSDTask(id string) (model.PSDTask, bool) {
	state, ok := getPSDTaskState(id)
	if !ok {
		return model.PSDTask{}, false
	}
	task := clonePSDTask(state.task)
	return task, true
}

func PSDTaskFilePath(id string, name string) (string, string, bool) {
	state, ok := getPSDTaskState(id)
	if !ok {
		return "", "", false
	}
	taskDir := state.taskDir
	basename := state.basename
	paths := map[string]string{
		"source":   state.sourcePath,
		"preview":  filepath.Join(taskDir, basename+"_layered_preview.png"),
		"psd":      filepath.Join(taskDir, basename+"_editable.psd"),
		"zip":      filepath.Join(taskDir, basename+"_layer_assets.zip"),
		"manifest": filepath.Join(taskDir, basename+"_layers_manifest.json"),
		"config":   filepath.Join(taskDir, "layers.json"),
	}
	path, ok := paths[name]
	if !ok {
		return "", "", false
	}
	if _, err := os.Stat(path); err != nil {
		return "", "", false
	}
	return path, filepath.Base(path), true
}

func CancelPSDTask(id string) (model.PSDTask, bool) {
	var task model.PSDTask
	var ok bool
	psdTasks.mu.Lock()
	if state, exists := psdTasks.items[id]; exists {
		ok = true
		if isPSDTaskRunning(state.task.Status) {
			if state.cancel != nil {
				state.cancel()
			}
			state.task.Status = model.PSDTaskStatusCanceled
			state.task.Error = "任务已终止"
			state.task.FinishedAt = now()
		}
		task = clonePSDTask(state.task)
	}
	psdTasks.mu.Unlock()
	if ok {
		_ = persistPSDTaskByID(id)
		return task, true
	}
	state, exists := recoverPSDTaskState(id)
	if !exists {
		return model.PSDTask{}, false
	}
	return clonePSDTask(state.task), true
}

func runPSDTask(ctx context.Context, id string) {
	updatePSDTask(id, func(state *psdTaskState) {
		if state.task.Status != model.PSDTaskStatusCanceled {
			state.task.Status = model.PSDTaskStatusRunning
		}
	})
	err := executePSDTask(ctx, id)
	updatePSDTask(id, func(state *psdTaskState) {
		if state.task.Status == model.PSDTaskStatusCanceled || ctx.Err() != nil {
			state.task.Status = model.PSDTaskStatusCanceled
			state.task.Error = "任务已终止"
		} else if err != nil {
			state.task.Status = model.PSDTaskStatusFailed
			state.task.Error = safeTaskError(err)
		} else {
			state.task.Status = model.PSDTaskStatusSuccess
		}
		state.cancel = nil
		state.task.FinishedAt = now()
	})
}

func executePSDTask(ctx context.Context, id string) error {
	state, ok := psdTaskSnapshot(id)
	if !ok {
		return errors.New("任务不存在")
	}
	return newPosterLayerPSDExecutor().Execute(ctx, state.taskDir, state.sourcePath, state.basename, state.task.Model)
}

func generatePSDLayerConfig(ctx context.Context, sourcePath string, basename string, modelName string) ([]byte, error) {
	sourceBytes, err := os.ReadFile(sourcePath)
	if err != nil {
		return nil, err
	}
	skillPrompt, err := posterLayerPSDSkillPrompt()
	if err != nil {
		return nil, err
	}
	mimeType := http.DetectContentType(sourceBytes)
	width, height := readImageSize(sourceBytes)
	prompt := psdConfigPrompt(basename, width, height)
	content, err := requestPSDResponseJSON(ctx, modelName, skillPrompt, []psdResponseContent{
		{Type: "input_text", Text: prompt},
		{Type: "input_image", ImageURL: "data:" + mimeType + ";base64," + base64.StdEncoding.EncodeToString(sourceBytes)},
	})
	if err != nil {
		return nil, err
	}
	configJSON, err := normalizePSDLayerConfig(content, basename)
	if err != nil {
		return nil, err
	}
	return configJSON, nil
}

func requestPSDResponseJSON(ctx context.Context, modelName string, systemPrompt string, content []psdResponseContent) (string, error) {
	channel, err := SelectModelChannel(modelName)
	if err != nil {
		return "", err
	}
	payload, _ := json.Marshal(map[string]any{
		"model": modelName,
		"input": []psdResponseInput{
			{Role: "system", Content: systemPrompt},
			{Role: "user", Content: content},
		},
		"reasoning": map[string]string{"effort": "high"},
		"text": map[string]any{
			"format": map[string]string{"type": "json_object"},
		},
	})
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, BuildModelChannelURL(channel, "/responses"), bytes.NewReader(payload))
	if err != nil {
		return "", err
	}
	request.Header.Set("Authorization", "Bearer "+channel.APIKey)
	request.Header.Set("Content-Type", "application/json")
	client := &http.Client{Timeout: psdTaskHTTPTimeout}
	response, err := client.Do(request)
	if err != nil {
		return "", safeMessageError{message: "文本模型请求失败"}
	}
	defer response.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(response.Body, 4<<20))
	if response.StatusCode >= http.StatusBadRequest {
		return "", safeMessageError{message: readPSDUpstreamError(body, response.StatusCode)}
	}
	return readPSDResponseContent(body)
}

func psdConfigPrompt(basename string, width int, height int) string {
	sizeHint := ""
	if width > 0 && height > 0 {
		sizeHint = fmt.Sprintf("图片尺寸为 %dx%d。", width, height)
	}
	return strings.TrimSpace(sizeHint + `
请把这张海报、App 截图、落地页或营销图拆解为可编辑 PSD 图层配置 JSON。
你的输出会直接交给 Python 脚本生成 PSD、透明 PNG 图层 ZIP、manifest 和预览图，所以必须严格使用脚本支持的字段。

必须符合这个结构：
{
  "basename": "` + basename + `",
  "background": {
    "mode": "clean",
    "name": "00_clean_background",
    "fill": [250,252,247],
    "blur": 42,
    "tint": 0.78,
    "masks": [{"box":[left,top,right,bottom]}],
    "alpha_from_layers": []
  },
  "layers": [
    {"name":"01_hero_object","box":[left,top,right,bottom],"extract":"raw"},
    {"name":"02_card_background","type":"panel","box":[left,top,right,bottom],"rect":[0,0,width,height],"radius":12,"fill":[255,255,255,248],"shadow_alpha":18,"shadow_blur":10}
  ]
}

支持字段：
1. 顶层只使用 basename、background、layers。
2. background.mode 只能是 "source"、"solid"、"clean"；优先用 "clean"。
3. background.masks 是源图像坐标矩形，用来覆盖大块前景区域，例如卡片、导航栏、主视觉、按钮组、图片区域。
4. background.alpha_from_layers 只能引用 layers 中已经存在的图层名，适合人物、植物、商品、Logo 等不规则主体。
5. layer.name 必填，只能用英文、数字、下划线，按视觉从底到顶编号，例如 01_hero_product。
6. layer.box 必填，格式为 [left, top, right, bottom]，必须是源图像像素坐标，left < right，top < bottom，不要超出图片边界。
7. extract 只能是 "raw"、"photo"、"circle"、"nonbg"、"light-bg"、"plant"。
8. type 只能是 "panel"、"nav-bar"、"solid"。使用 type 时仍必须提供 box。
9. panel 可使用 rect、radius、fill、shadow_alpha、shadow_blur、shadow_offset；rect 是图层内部局部坐标，不是源图像坐标。
10. photo 和 solid 可使用 radius。

拆层策略：
1. 用提取 PNG 图层处理文字、图标、照片、Logo、商品、人物、装饰物。
2. 简单白色/浅色卡片、工具栏、导航栏、按钮背景优先生成 type:"panel"、type:"nav-bar" 或 type:"solid"，不要把整张卡片作为 raw 大图层。
3. 卡片背景生成后，卡片内的文字、图标、照片、状态标记仍要单独拆成上层。
4. 文字、深色图标、线性图标在浅色背景上优先用 extract:"nonbg" 或 "light-bg"。
5. 文字层 box 必须包含完整字形、标点、阴影和行高，不要裁掉中文笔画、英文上下伸出部分、数字上沿或图标边缘。
6. 文字、Logo、图标层的 box 在可见内容外至少预留 4 到 8 像素安全边距；小字号、细线图标和中文文字宁可稍大，不要贴边。
7. 多字词、标题、按钮文字、标签文字按自然短语或整行拆层，不要逐字拆；同一行文字高度必须覆盖整行最高和最低笔画。
8. 照片、截图缩略图、商品图使用 extract:"photo"，有圆角时加 radius。
9. 头像或圆形图标使用 extract:"circle"。
10. 绿色植物或类似不规则主体可用 extract:"plant"。
11. 不确定如何抠图时使用 extract:"raw"，不要创造脚本不支持的 extract/type。
12. 只拆主要可编辑元素，优先 15 到 40 层；简单图可以少于 15 层，复杂图最多 60 层。
13. 图层顺序按 PSD 从底到顶排列：背景不放进 layers，先放大块面板/导航，再放照片/商品，最后放文字、Logo、图标和前景装饰。

规则：
1. 只返回 JSON 对象，不要代码块。
2. 不要输出注释、解释、Markdown、自然语言。
3. 不要输出脚本不支持的字段，例如 opacity、blend、font、text、path、mask、children、group。
4. panel、photo、商品、人物等大元素坐标尽量贴合可见边界，避免过大框住无关内容。
5. 文字、Logo、图标坐标必须优先保证不裁切，可比可见边界略大，不要为了贴合而切掉边缘。
6. 返回的 JSON 必须能被 Python json.loads 解析。`)
}

func readPSDResponseContent(body []byte) (string, error) {
	var payload struct {
		OutputText string `json:"output_text"`
		Output     []struct {
			Type    string `json:"type"`
			Content []struct {
				Type string `json:"type"`
				Text string `json:"text"`
			} `json:"content"`
		} `json:"output"`
		Error *struct {
			Message string `json:"message"`
		} `json:"error"`
		Msg string `json:"msg"`
	}
	if err := json.Unmarshal(body, &payload); err != nil {
		return "", safeMessageError{message: "文本模型返回异常"}
	}
	if payload.Error != nil && strings.TrimSpace(payload.Error.Message) != "" {
		return "", safeMessageError{message: payload.Error.Message}
	}
	if strings.TrimSpace(payload.Msg) != "" {
		return "", safeMessageError{message: payload.Msg}
	}
	if strings.TrimSpace(payload.OutputText) != "" {
		return payload.OutputText, nil
	}
	parts := []string{}
	for _, output := range payload.Output {
		if output.Type != "message" {
			continue
		}
		for _, content := range output.Content {
			if content.Type == "output_text" && strings.TrimSpace(content.Text) != "" {
				parts = append(parts, content.Text)
			}
		}
	}
	if len(parts) == 0 {
		return "", safeMessageError{message: "文本模型没有返回图层配置"}
	}
	return strings.Join(parts, ""), nil
}

func normalizePSDLayerConfig(text string, basename string) ([]byte, error) {
	text = strings.TrimSpace(text)
	text = strings.TrimPrefix(text, "```json")
	text = strings.TrimPrefix(text, "```")
	text = strings.TrimSuffix(text, "```")
	start := strings.Index(text, "{")
	end := strings.LastIndex(text, "}")
	if start < 0 || end <= start {
		return nil, safeMessageError{message: "文本模型没有返回有效 JSON"}
	}
	raw := []byte(text[start : end+1])
	var cfg psdLayerConfig
	if err := json.Unmarshal(raw, &cfg); err != nil {
		return nil, safeMessageError{message: "文本模型返回的图层 JSON 无法解析"}
	}
	var preserved map[string]any
	if err := json.Unmarshal(raw, &preserved); err != nil {
		return nil, safeMessageError{message: "文本模型返回的图层 JSON 无法解析"}
	}
	if len(cfg.Layers) == 0 {
		return nil, safeMessageError{message: "文本模型没有识别出图层"}
	}
	layerNames := map[string]bool{}
	for _, layer := range cfg.Layers {
		name := strings.TrimSpace(layer.Name)
		if name == "" || len(layer.Box) != 4 {
			return nil, safeMessageError{message: "文本模型返回的图层缺少名称或坐标"}
		}
		layerNames[name] = true
	}
	preserved["basename"] = basename
	repairPSDBackgroundRefs(preserved, layerNames)
	out, _ := json.MarshalIndent(preserved, "", "  ")
	return out, nil
}

func repairPSDBackgroundRefs(config map[string]any, layerNames map[string]bool) {
	background, ok := config["background"].(map[string]any)
	if !ok {
		return
	}
	rawRefs, ok := background["alpha_from_layers"].([]any)
	if !ok {
		return
	}
	refs := []string{}
	for _, item := range rawRefs {
		name, ok := item.(string)
		if !ok {
			continue
		}
		name = strings.TrimSpace(name)
		if layerNames[name] {
			refs = append(refs, name)
		}
	}
	background["alpha_from_layers"] = refs
}

func defaultPSDTextModel() (string, error) {
	settings, err := repository.GetSettings()
	if err != nil {
		return "", err
	}
	public := normalizeSettings(settings).Public.ModelChannel
	modelName := strings.TrimSpace(public.DefaultTextModel)
	if modelName == "" {
		modelName = strings.TrimSpace(public.DefaultModel)
	}
	if modelName == "" {
		return "", safeMessageError{message: "请先刷新云端控制 LLM 配置"}
	}
	return modelName, nil
}

func posterLayerScriptPath() (string, error) {
	root, err := posterLayerSkillRoot()
	if err != nil {
		return "", err
	}
	return filepath.Join(root, psdScriptPath), nil
}

func posterLayerSkillRoot() (string, error) {
	candidates := []string{
		filepath.Join(resourceRoot(), psdSkillPath),
		filepath.Join(projectRoot(), psdSkillPath),
	}
	for _, root := range candidates {
		if _, err := os.Stat(filepath.Join(root, psdScriptPath)); err == nil {
			return root, nil
		}
	}
	return "", safeMessageError{message: "未找到 poster-layer-psd skill"}
}

func ensurePythonRuntime() (string, string, error) {
	if runtime.GOOS != "windows" {
		if path, err := exec.LookPath("python3"); err == nil {
			return path, filepath.Dir(path), nil
		}
		path, err := exec.LookPath("python")
		if err != nil {
			return "", "", safeMessageError{message: "未找到 Python 运行时"}
		}
		return path, filepath.Dir(path), nil
	}
	targetRoot := filepath.Join(appDataRoot(), "python-runtime")
	zipPath, err := pythonZipPath()
	if err != nil {
		return "", "", err
	}
	targetDir := filepath.Join(targetRoot, strings.TrimSuffix(filepath.Base(zipPath), filepath.Ext(zipPath)))
	if python := findPythonExe(targetDir); python != "" {
		_ = ensureEmbeddablePythonPath(filepath.Dir(python))
		return python, filepath.Dir(python), nil
	}
	_ = os.RemoveAll(targetDir)
	if err := unzipPython(zipPath, targetDir); err != nil {
		return "", "", err
	}
	if python := findPythonExe(targetDir); python != "" {
		_ = ensureEmbeddablePythonPath(filepath.Dir(python))
		return python, filepath.Dir(python), nil
	}
	return "", "", safeMessageError{message: "内置 Python 解压后未找到 python.exe"}
}

func pythonZipPath() (string, error) {
	aliases := pythonArchAliases()
	dirs := []string{
		filepath.Join(resourceRoot(), "python-bin"),
		filepath.Join(projectRoot(), "python-bin"),
	}
	available := []string{}
	for _, dir := range dirs {
		items, err := os.ReadDir(dir)
		if err != nil {
			continue
		}
		names := []string{}
		for _, item := range items {
			name := item.Name()
			if !item.IsDir() && strings.HasPrefix(strings.ToLower(name), "python") && strings.HasSuffix(strings.ToLower(name), ".zip") {
				path := filepath.Join(dir, name)
				available = append(available, name)
				if matchesPythonArch(name, aliases) {
					names = append(names, path)
				}
			}
		}
		sort.Strings(names)
		if len(names) > 0 {
			return names[0], nil
		}
	}
	if len(available) > 0 {
		sort.Strings(available)
		return "", safeMessageError{message: fmt.Sprintf("当前 Windows 架构为 %s，请在 python-bin 放入匹配的内置 Python 压缩包；当前只有：%s", runtime.GOARCH, strings.Join(available, ", "))}
	}
	return "", safeMessageError{message: "未找到内置 Python 压缩包"}
}

func pythonArchAliases() []string {
	switch runtime.GOARCH {
	case "amd64":
		return []string{"amd64", "x64", "win64"}
	case "arm64":
		return []string{"arm64", "aarch64"}
	default:
		return []string{runtime.GOARCH}
	}
}

func matchesPythonArch(name string, aliases []string) bool {
	lower := strings.ToLower(name)
	for _, alias := range aliases {
		if strings.Contains(lower, alias) {
			return true
		}
	}
	return false
}

func unzipPython(zipPath string, targetDir string) error {
	reader, err := zip.OpenReader(zipPath)
	if err != nil {
		return err
	}
	defer reader.Close()
	if err := os.MkdirAll(targetDir, 0755); err != nil {
		return err
	}
	for _, file := range reader.File {
		zipName := strings.ReplaceAll(file.Name, "\\", "/")
		zipName = strings.TrimPrefix(zipName, "/")
		isDir := strings.HasSuffix(zipName, "/")
		zipName = strings.TrimSuffix(zipName, "/")
		if zipName == "" {
			continue
		}
		targetPath := filepath.Join(targetDir, filepath.FromSlash(zipName))
		cleanTarget, err := filepath.Abs(targetPath)
		if err != nil {
			return err
		}
		cleanRoot, _ := filepath.Abs(targetDir)
		if !strings.HasPrefix(cleanTarget, cleanRoot+string(os.PathSeparator)) && cleanTarget != cleanRoot {
			return errors.New("Python 压缩包路径异常")
		}
		if isDir || file.FileInfo().IsDir() {
			if err := os.MkdirAll(targetPath, 0755); err != nil {
				return err
			}
			continue
		}
		if err := os.MkdirAll(filepath.Dir(targetPath), 0755); err != nil {
			return err
		}
		source, err := file.Open()
		if err != nil {
			return err
		}
		target, err := os.OpenFile(targetPath, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, file.Mode())
		if err != nil {
			_ = source.Close()
			return err
		}
		_, copyErr := io.Copy(target, source)
		closeErr := target.Close()
		_ = source.Close()
		if copyErr != nil {
			return copyErr
		}
		if closeErr != nil {
			return closeErr
		}
	}
	return nil
}

func findPythonExe(root string) string {
	entries, err := os.ReadDir(root)
	if err != nil {
		return ""
	}
	for _, entry := range entries {
		path := filepath.Join(root, entry.Name())
		if entry.IsDir() {
			if found := findPythonExe(path); found != "" {
				return found
			}
			continue
		}
		if strings.EqualFold(entry.Name(), "python.exe") {
			return path
		}
	}
	return ""
}

func ensureEmbeddablePythonPath(pythonDir string) error {
	entries, err := os.ReadDir(pythonDir)
	if err != nil {
		return err
	}
	pthPath := ""
	for _, entry := range entries {
		if !entry.IsDir() && strings.HasSuffix(strings.ToLower(entry.Name()), "._pth") {
			pthPath = filepath.Join(pythonDir, entry.Name())
			break
		}
	}
	if pthPath == "" {
		return nil
	}
	sitePackages := filepath.Join(pythonDir, "Lib", "site-packages")
	_ = os.MkdirAll(sitePackages, 0755)
	contentBytes, err := os.ReadFile(pthPath)
	if err != nil {
		return err
	}
	lines := strings.Split(strings.ReplaceAll(string(contentBytes), "\r\n", "\n"), "\n")
	hasSitePackages := false
	hasImportSite := false
	for i, line := range lines {
		trimmed := strings.TrimSpace(line)
		if strings.EqualFold(strings.ReplaceAll(trimmed, "\\", "/"), "Lib/site-packages") {
			hasSitePackages = true
		}
		if trimmed == "#import site" {
			lines[i] = "import site"
			hasImportSite = true
		} else if trimmed == "import site" {
			hasImportSite = true
		}
	}
	if !hasSitePackages {
		lines = append(lines, "Lib/site-packages")
	}
	if !hasImportSite {
		lines = append(lines, "import site")
	}
	return os.WriteFile(pthPath, []byte(strings.Join(lines, "\r\n")), 0644)
}

func validatePSDOutputs(dir string, basename string) error {
	required := []string{
		basename + "_editable.psd",
		basename + "_layer_assets.zip",
		basename + "_layers_manifest.json",
		basename + "_layered_preview.png",
	}
	for _, name := range required {
		if _, err := os.Stat(filepath.Join(dir, name)); err != nil {
			return fmt.Errorf("缺少产物 %s", name)
		}
	}
	return nil
}

func psdTaskRoot() string {
	root := filepath.Join(appDataRoot(), psdTaskRootName)
	_ = os.MkdirAll(root, 0755)
	return root
}

func appDataRoot() string {
	if strings.TrimSpace(config.Cfg.AppDataDir) != "" {
		return config.Cfg.AppDataDir
	}
	if strings.TrimSpace(config.Cfg.DatabaseDSN) != "" && config.Cfg.DatabaseDSN != ":memory:" {
		return filepath.Dir(filepath.Dir(config.Cfg.DatabaseDSN))
	}
	return "data"
}

func resourceRoot() string {
	if strings.TrimSpace(config.Cfg.ResourceDir) != "" {
		return config.Cfg.ResourceDir
	}
	return projectRoot()
}

func projectRoot() string {
	wd, err := os.Getwd()
	if err != nil {
		return "."
	}
	return wd
}

func saveUploadedFile(file multipart.File, path string) error {
	target, err := os.Create(path)
	if err != nil {
		return err
	}
	defer target.Close()
	_, err = io.Copy(target, io.LimitReader(file, psdMaxUploadBytes+1))
	return err
}

func updatePSDTask(id string, fn func(*psdTaskState)) {
	var snapshot *psdTaskState
	psdTasks.mu.Lock()
	if state, ok := psdTasks.items[id]; ok {
		fn(state)
		copied := *state
		copied.task = clonePSDTask(state.task)
		snapshot = &copied
	}
	psdTasks.mu.Unlock()
	if snapshot != nil {
		_ = persistPSDTaskState(snapshot)
	}
}

func persistPSDTaskByID(id string) error {
	state, ok := getPSDTaskState(id)
	if !ok {
		return nil
	}
	return persistPSDTaskState(&state)
}

func psdTaskSnapshot(id string) (psdTaskState, bool) {
	return getPSDTaskState(id)
}

func getPSDTaskState(id string) (psdTaskState, bool) {
	psdTasks.mu.RLock()
	state, ok := psdTasks.items[id]
	if !ok {
		psdTasks.mu.RUnlock()
		return recoverPSDTaskState(id)
	}
	snapshot := *state
	snapshot.task = clonePSDTask(state.task)
	psdTasks.mu.RUnlock()
	return snapshot, true
}

func recoverPSDTaskState(id string) (psdTaskState, bool) {
	if !safePSDTaskID(id) {
		return psdTaskState{}, false
	}
	taskDir := filepath.Join(psdTaskRoot(), id)
	info, err := os.Stat(taskDir)
	if err != nil || !info.IsDir() {
		return psdTaskState{}, false
	}
	basename := inferPSDBasename(taskDir, id)
	sourcePath := findPSDSourcePath(taskDir)
	task, ok := readPSDTaskMeta(taskDir)
	needsOutputCheck := !ok
	if !ok {
		sourceName := ""
		if sourcePath != "" {
			sourceName = filepath.Base(sourcePath)
		}
		task = model.PSDTask{
			ID:         id,
			SourceName: sourceName,
			StartedAt:  info.ModTime().Format(time.RFC3339),
		}
	}
	if task.ID == "" {
		task.ID = id
	}
	if task.SourceName == "" && sourcePath != "" {
		task.SourceName = filepath.Base(sourcePath)
	}
	if task.StartedAt == "" {
		task.StartedAt = info.ModTime().Format(time.RFC3339)
	}
	if needsOutputCheck || task.Status == "" || task.Status == model.PSDTaskStatusPending || task.Status == model.PSDTaskStatusRunning {
		if err := validatePSDOutputs(taskDir, basename); err == nil {
			task.Status = model.PSDTaskStatusSuccess
		} else {
			task.Status = model.PSDTaskStatusFailed
			task.Error = "任务未完成，应用重启后无法继续执行，请重新开始任务"
		}
	}
	if task.FinishedAt == "" && (task.Status == model.PSDTaskStatusSuccess || task.Status == model.PSDTaskStatusFailed || task.Status == model.PSDTaskStatusCanceled) {
		task.FinishedAt = info.ModTime().Format(time.RFC3339)
	}
	task.Files = psdTaskFiles(id)
	state := &psdTaskState{
		taskDir:    taskDir,
		sourcePath: sourcePath,
		basename:   basename,
		task:       task,
	}
	psdTasks.mu.Lock()
	if existing, ok := psdTasks.items[id]; ok {
		snapshot := *existing
		snapshot.task = clonePSDTask(existing.task)
		psdTasks.mu.Unlock()
		return snapshot, true
	}
	psdTasks.items[id] = state
	psdTasks.mu.Unlock()
	_ = persistPSDTaskState(state)
	return *state, true
}

func persistPSDTaskState(state *psdTaskState) error {
	if state == nil || state.taskDir == "" || state.task.ID == "" {
		return nil
	}
	task := clonePSDTask(state.task)
	task.Files = psdTaskFiles(task.ID)
	data, err := json.MarshalIndent(task, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(state.taskDir, psdTaskMetaName), data, 0644)
}

func readPSDTaskMeta(taskDir string) (model.PSDTask, bool) {
	data, err := os.ReadFile(filepath.Join(taskDir, psdTaskMetaName))
	if err != nil {
		return model.PSDTask{}, false
	}
	var task model.PSDTask
	if err := json.Unmarshal(data, &task); err != nil {
		return model.PSDTask{}, false
	}
	return task, true
}

func inferPSDBasename(taskDir string, id string) string {
	matches, _ := filepath.Glob(filepath.Join(taskDir, "*_layers_manifest.json"))
	if len(matches) > 0 {
		name := filepath.Base(matches[0])
		return strings.TrimSuffix(name, "_layers_manifest.json")
	}
	return "psd_" + id
}

func findPSDSourcePath(taskDir string) string {
	entries, err := os.ReadDir(taskDir)
	if err != nil {
		return ""
	}
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		name := entry.Name()
		if name == "source" || strings.HasPrefix(name, "source.") {
			return filepath.Join(taskDir, name)
		}
	}
	return ""
}

func safePSDTaskID(id string) bool {
	id = strings.TrimSpace(id)
	return id != "" && id != "." && id != ".." && !strings.ContainsAny(id, `/\`)
}

func psdTaskFiles(id string) []model.PSDTaskFile {
	base := "/api/v1/psd-tasks/" + id + "/files/"
	return []model.PSDTaskFile{
		{Name: "source", URL: base + "source"},
		{Name: "preview", URL: base + "preview"},
		{Name: "psd", URL: base + "psd"},
		{Name: "zip", URL: base + "zip"},
		{Name: "manifest", URL: base + "manifest"},
		{Name: "config", URL: base + "config"},
	}
}

func clonePSDTask(task model.PSDTask) model.PSDTask {
	task.Files = append([]model.PSDTaskFile(nil), task.Files...)
	return task
}

func isPSDTaskRunning(status model.PSDTaskStatus) bool {
	return status == model.PSDTaskStatusPending || status == model.PSDTaskStatusRunning
}

func newTaskID() string {
	buf := make([]byte, 8)
	_, _ = rand.Read(buf)
	return time.Now().Format("20060102150405") + "-" + hex.EncodeToString(buf)
}

func safeFileName(name string) string {
	name = filepath.Base(strings.TrimSpace(name))
	if name == "." || name == "" {
		return "source.png"
	}
	replacer := strings.NewReplacer("/", "_", "\\", "_", ":", "_", "*", "_", "?", "_", "\"", "_", "<", "_", ">", "_", "|", "_")
	return replacer.Replace(name)
}

func readImageSize(data []byte) (int, int) {
	cfg, _, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil {
		return 0, 0
	}
	return cfg.Width, cfg.Height
}

func readPSDUpstreamError(body []byte, statusCode int) string {
	var payload struct {
		Msg   string `json:"msg"`
		Error *struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	_ = json.Unmarshal(body, &payload)
	if payload.Error != nil && strings.TrimSpace(payload.Error.Message) != "" {
		return payload.Error.Message
	}
	if strings.TrimSpace(payload.Msg) != "" {
		return payload.Msg
	}
	return fmt.Sprintf("文本模型请求失败：%d", statusCode)
}

func safeTaskError(err error) string {
	if safe, ok := err.(interface{ SafeMessage() string }); ok {
		return safe.SafeMessage()
	}
	return strings.TrimSpace(err.Error())
}

func tailString(text string, max int) string {
	text = strings.TrimSpace(text)
	runes := []rune(text)
	if len(runes) <= max {
		return text
	}
	return string(runes[len(runes)-max:])
}

func psdCommandError(err error, output string, pythonPath string, scriptPath string, configPath string, outDir string) string {
	detail := tailString(output, psdPythonOutputTail)
	if detail == "" {
		detail = err.Error()
	}
	return fmt.Sprintf("%s；python=%s；script=%s；config=%s；out=%s", detail, pythonPath, scriptPath, configPath, outDir)
}
