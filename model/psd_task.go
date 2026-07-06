package model

type PSDTaskStatus string

const (
	PSDTaskStatusPending PSDTaskStatus = "pending"
	PSDTaskStatusRunning PSDTaskStatus = "running"
	PSDTaskStatusSuccess PSDTaskStatus = "success"
	PSDTaskStatusFailed  PSDTaskStatus = "failed"
)

type PSDTaskFile struct {
	Name string `json:"name"`
	URL  string `json:"url"`
}

type PSDTask struct {
	ID         string        `json:"id"`
	Status     PSDTaskStatus `json:"status"`
	SourceName string        `json:"sourceName"`
	Model      string        `json:"model"`
	StartedAt  string        `json:"startedAt"`
	FinishedAt string        `json:"finishedAt"`
	Error      string        `json:"error"`
	Files      []PSDTaskFile `json:"files"`
}
