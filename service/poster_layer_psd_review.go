package service

import (
	"bytes"
	"encoding/json"
	"fmt"
)

type posterLayerPSDWarning string

func (warning posterLayerPSDWarning) Error() string { return string(warning) }

type posterLayerPSDChange struct {
	Name   string            `json:"name"`
	Layers []json.RawMessage `json:"layers"`
}

func applyPSDLayerChanges(configJSON []byte, changes []posterLayerPSDChange, basename string) ([]byte, error) {
	if len(changes) == 0 {
		return nil, fmt.Errorf("检查未提供局部修正")
	}
	var config map[string]json.RawMessage
	if err := json.Unmarshal(configJSON, &config); err != nil {
		return nil, err
	}
	var layers []json.RawMessage
	if err := json.Unmarshal(config["layers"], &layers); err != nil {
		return nil, err
	}
	replacements := make(map[string][]json.RawMessage, len(changes))
	for _, change := range changes {
		if _, exists := replacements[change.Name]; exists || change.Name == "" || change.Layers == nil {
			return nil, fmt.Errorf("图层替换缺少名称、layers 或存在重复名称")
		}
		replacements[change.Name] = change.Layers
	}
	updated := []json.RawMessage{}
	for _, layer := range layers {
		var spec struct {
			Name string `json:"name"`
		}
		if err := json.Unmarshal(layer, &spec); err != nil {
			return nil, err
		}
		if replacement, exists := replacements[spec.Name]; exists {
			updated = append(updated, replacement...)
			delete(replacements, spec.Name)
		} else {
			updated = append(updated, layer)
		}
	}
	if len(replacements) > 0 {
		return nil, fmt.Errorf("替换引用了不存在的图层")
	}
	config["layers"], _ = json.Marshal(updated)
	raw, _ := json.Marshal(config)
	result, err := normalizePSDLayerConfig(string(raw), basename)
	if err != nil {
		return nil, err
	}
	original, err := normalizePSDLayerConfig(string(configJSON), basename)
	if err != nil {
		return nil, err
	}
	if bytes.Equal(original, result) {
		return nil, fmt.Errorf("修正没有产生任何图层变化")
	}
	return result, nil
}
