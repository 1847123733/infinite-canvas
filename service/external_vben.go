package service

import (
	"encoding/json"
	"fmt"
	"net/url"
	"sort"
	"strings"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

type externalVbenExtra struct {
	UserID       int    `json:"userId"`
	HomePath     string `json:"homePath,omitempty"`
	IsSuperAdmin bool   `json:"isSuperAdmin"`
}

type externalChannelGroup struct {
	Channel model.ModelChannel
}

func loginWithExternalVben(username string, password string) (model.AuthSession, bool, error) {
	if !repository.ExternalVbenEnabled() {
		return model.AuthSession{}, false, nil
	}
	externalUser, ok, err := repository.GetExternalVbenUserByUsername(username)
	if err != nil {
		return model.AuthSession{}, false, safeMessageError{message: "连接外部账号服务失败"}
	}
	if !ok {
		return model.AuthSession{}, false, nil
	}
	if externalUser.Password != password {
		return model.AuthSession{}, true, safeMessageError{message: "用户名或密码错误"}
	}
	if externalUser.Status != 1 {
		return model.AuthSession{}, true, safeMessageError{message: "账号已被禁用"}
	}
	allowed, err := externalVbenUserAllowed(externalUser)
	if err != nil {
		return model.AuthSession{}, true, err
	}
	if !allowed {
		return model.AuthSession{}, true, safeMessageError{message: "当前账号未开通无限画布登录权限"}
	}
	if _, err := SyncExternalVbenLLMSettings(); err != nil {
		return model.AuthSession{}, true, err
	}
	user, err := upsertExternalVbenUser(externalUser, password)
	if err != nil {
		return model.AuthSession{}, true, err
	}
	session, err := newSession(user)
	return session, true, err
}

func SyncExternalVbenLLMSettings() (model.ExternalVbenLLMSyncResult, error) {
	if !repository.ExternalVbenEnabled() {
		return model.ExternalVbenLLMSyncResult{}, safeMessageError{message: "未配置 EXTERNAL_VBEN_DATABASE_DSN"}
	}
	current, err := repository.GetSettings()
	if err != nil {
		return model.ExternalVbenLLMSyncResult{}, err
	}
	settings := normalizeSettings(current)
	items, err := repository.ListExternalVbenLLMModels()
	if err != nil {
		return model.ExternalVbenLLMSyncResult{}, safeMessageError{message: "读取外部 LLM 配置失败"}
	}
	channels, result, err := buildExternalVbenChannels(items, settings.Private.Channels, settings.Public.ModelChannel)
	if err != nil {
		return model.ExternalVbenLLMSyncResult{}, err
	}
	settings.Private.Channels = channels
	availableModels := enabledChannelModels(channels)
	allowedModels := map[string]bool{}
	for _, item := range availableModels {
		allowedModels[item] = true
	}
	modelCosts := []model.ModelCost{}
	for _, item := range settings.Public.ModelChannel.ModelCosts {
		if allowedModels[item.Model] {
			modelCosts = append(modelCosts, item)
		}
	}
	settings.Public.ModelChannel.AvailableModels = availableModels
	settings.Public.ModelChannel.ModelCosts = modelCosts
	settings.Public.ModelChannel.DefaultTextModel = result.DefaultTextModel
	settings.Public.ModelChannel.DefaultImageModel = result.DefaultImageModel
	settings.Public.ModelChannel.DefaultModel = result.DefaultTextModel
	_, err = SaveSettings(settings)
	return result, err
}

func buildExternalVbenChannels(items []model.ExternalVbenLLMModel, existing []model.ModelChannel, public model.PublicModelChannelSetting) ([]model.ModelChannel, model.ExternalVbenLLMSyncResult, error) {
	groups := map[string]*externalChannelGroup{}
	skipped := map[string]int{}
	textModels := []string{}
	imageModels := []string{}
	defaultTextCandidates := []string{}
	defaultImageCandidates := []string{}
	for _, item := range items {
		modelName := strings.TrimSpace(item.ModelName)
		mode := strings.ToLower(strings.TrimSpace(item.Mode))
		protocol := strings.ToLower(strings.TrimSpace(item.Protocol))
		baseURL := strings.TrimSpace(item.APIBaseURL)
		apiKey := strings.TrimSpace(item.APIKey)
		if modelName == "" || baseURL == "" || apiKey == "" {
			skipped["配置不完整"]++
			continue
		}
		if mode != "chat" && mode != "image" {
			skipped["非聊天/生图模型"]++
			continue
		}
		if protocol != "openai" && protocol != "volcengine" {
			skipped["不支持协议 "+protocol]++
			continue
		}
		if mode == "chat" {
			textModels = append(textModels, modelName)
			if item.IsDefault {
				defaultTextCandidates = append(defaultTextCandidates, modelName)
			}
		}
		if mode == "image" {
			imageModels = append(imageModels, modelName)
			if item.IsDefault {
				defaultImageCandidates = append(defaultImageCandidates, modelName)
			}
		}
		key := strings.ToLower(strings.TrimSpace(baseURL)) + "\n" + apiKey
		group := groups[key]
		if group == nil {
			group = &externalChannelGroup{
				Channel: model.ModelChannel{
					Protocol: "openai",
					Name:     buildExternalVbenChannelName(item.Name, baseURL),
					BaseURL:  baseURL,
					APIKey:   apiKey,
					Models:   []string{},
					Weight:   1,
					Enabled:  true,
					Remark:   "从 vben-admin-monorepo-template 同步",
				},
			}
			groups[key] = group
		}
		group.Channel.Models = append(group.Channel.Models, modelName)
	}
	videoChannels := extractChannelsByModel(existing, isVideoModelName)
	nextChannels := []model.ModelChannel{}
	for _, group := range groups {
		channel := group.Channel
		channel.Models = uniqueModelNames(channel.Models)
		sort.Strings(channel.Models)
		nextChannels = append(nextChannels, channel)
	}
	nextChannels = mergeModelChannels(nextChannels, videoChannels)
	sort.Slice(nextChannels, func(i int, j int) bool {
		if nextChannels[i].Name == nextChannels[j].Name {
			return nextChannels[i].BaseURL < nextChannels[j].BaseURL
		}
		return nextChannels[i].Name < nextChannels[j].Name
	})
	textModels = uniqueModelNames(textModels)
	imageModels = uniqueModelNames(imageModels)
	videoModels := enabledChannelModels(videoChannels)
	defaultTextModel := repairDefaultModel(firstNonEmpty(defaultTextCandidates...), textModels, isTextModelName)
	if defaultTextModel == "" {
		defaultTextModel = repairDefaultModel(public.DefaultTextModel, textModels, isTextModelName)
	}
	defaultImageModel := repairDefaultModel(firstNonEmpty(defaultImageCandidates...), imageModels, isImageModelName)
	if defaultImageModel == "" {
		defaultImageModel = repairDefaultModel(public.DefaultImageModel, imageModels, isImageModelName)
	}
	if len(textModels) == 0 && len(imageModels) == 0 {
		return nil, model.ExternalVbenLLMSyncResult{}, safeMessageError{message: "外部 LLM 配置中没有可同步的聊天或生图模型"}
	}
	result := model.ExternalVbenLLMSyncResult{
		Channels:          len(nextChannels),
		ChatModels:        len(textModels),
		ImageModels:       len(imageModels),
		VideoModels:       len(videoModels),
		DefaultTextModel:  defaultTextModel,
		DefaultImageModel: defaultImageModel,
		Skipped:           formatSkippedReasons(skipped),
	}
	return nextChannels, result, nil
}

func externalVbenUserAllowed(user model.ExternalVbenUser) (bool, error) {
	if user.IsSuperAdmin {
		return true, nil
	}
	roleIDs := []int{}
	if len(user.RoleIDs) > 0 {
		if err := json.Unmarshal(user.RoleIDs, &roleIDs); err != nil {
			return false, safeMessageError{message: "外部账号角色数据格式无效"}
		}
	}
	roles, err := repository.ListExternalVbenRolesByIDs(roleIDs)
	if err != nil {
		return false, safeMessageError{message: "读取外部账号角色失败"}
	}
	for _, role := range roles {
		if role.Status == 1 && role.CanLoginInfiniteCanvas {
			return true, nil
		}
	}
	return false, nil
}

func upsertExternalVbenUser(externalUser model.ExternalVbenUser, password string) (model.User, error) {
	localUser, ok, err := repository.GetUserByUsername(strings.TrimSpace(externalUser.Username))
	if err != nil {
		return model.User{}, err
	}
	if !ok {
		localUser = model.User{
			ID:        newID("user"),
			AffCode:   newAffCode(),
			CreatedAt: now(),
		}
	}
	hash, err := hashPassword(password)
	if err != nil {
		return model.User{}, err
	}
	extra := userExtra{}
	if strings.TrimSpace(localUser.Extra) != "" {
		_ = json.Unmarshal([]byte(localUser.Extra), &extra)
	}
	extra.ExternalVben = &externalVbenExtra{
		UserID:       externalUser.ID,
		HomePath:     externalUser.HomePath,
		IsSuperAdmin: externalUser.IsSuperAdmin,
	}
	extraJSON, _ := json.Marshal(extra)
	localUser.Username = strings.TrimSpace(externalUser.Username)
	localUser.Password = hash
	localUser.DisplayName = firstNonEmpty(strings.TrimSpace(externalUser.RealName), localUser.DisplayName, localUser.Username)
	localUser.AvatarURL = firstNonEmpty(strings.TrimSpace(externalUser.Avatar), localUser.AvatarURL)
	localUser.Role = model.UserRoleUser
	if externalUser.IsSuperAdmin {
		localUser.Role = model.UserRoleAdmin
	}
	localUser.Status = model.UserStatusActive
	localUser.LastLoginAt = now()
	localUser.UpdatedAt = now()
	localUser.Extra = string(extraJSON)
	return repository.SaveUser(localUser)
}

func extractChannelsByModel(channels []model.ModelChannel, filter func(string) bool) []model.ModelChannel {
	result := []model.ModelChannel{}
	for _, channel := range channels {
		models := []string{}
		for _, item := range channel.Models {
			if filter(item) {
				models = append(models, item)
			}
		}
		if len(models) == 0 {
			continue
		}
		next := normalizeModelChannel(channel)
		next.Models = uniqueModelNames(models)
		result = append(result, next)
	}
	return result
}

func mergeModelChannels(primary []model.ModelChannel, secondary []model.ModelChannel) []model.ModelChannel {
	grouped := map[string]model.ModelChannel{}
	order := []string{}
	appendChannel := func(channel model.ModelChannel) {
		key := strings.ToLower(strings.TrimSpace(channel.BaseURL)) + "\n" + channel.APIKey
		current, ok := grouped[key]
		if !ok {
			grouped[key] = normalizeModelChannel(channel)
			order = append(order, key)
			return
		}
		current.Models = uniqueModelNames(append(current.Models, channel.Models...))
		if current.Name == "" {
			current.Name = channel.Name
		}
		if current.Remark == "" {
			current.Remark = channel.Remark
		}
		grouped[key] = current
	}
	for _, channel := range primary {
		appendChannel(channel)
	}
	for _, channel := range secondary {
		appendChannel(channel)
	}
	result := make([]model.ModelChannel, 0, len(order))
	for _, key := range order {
		channel := grouped[key]
		sort.Strings(channel.Models)
		result = append(result, channel)
	}
	return result
}

func buildExternalVbenChannelName(name string, baseURL string) string {
	if strings.TrimSpace(name) != "" {
		return "vben-" + strings.TrimSpace(name)
	}
	parsed, err := url.Parse(baseURL)
	if err == nil && strings.TrimSpace(parsed.Host) != "" {
		return "vben-" + parsed.Host
	}
	return "vben-channel"
}

func formatSkippedReasons(skipped map[string]int) []string {
	if len(skipped) == 0 {
		return []string{}
	}
	keys := make([]string, 0, len(skipped))
	for key := range skipped {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	result := make([]string, 0, len(keys))
	for _, key := range keys {
		result = append(result, fmt.Sprintf("%s x%d", key, skipped[key]))
	}
	return result
}
