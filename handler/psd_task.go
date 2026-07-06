package handler

import (
	"net/http"
	"strings"

	"github.com/basketikun/infinite-canvas/service"
)

func CreatePSDTask(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseMultipartForm(32 << 20); err != nil {
		Fail(w, "请选择图片")
		return
	}
	file, header, err := r.FormFile("image")
	if err != nil {
		Fail(w, "请选择图片")
		return
	}
	defer file.Close()
	task, err := service.CreatePSDTask(file, header)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, task)
}

func PSDTask(w http.ResponseWriter, r *http.Request, id string) {
	task, ok := service.GetPSDTask(strings.TrimSpace(id))
	if !ok {
		Fail(w, "任务不存在")
		return
	}
	OK(w, task)
}

func PSDTaskFile(w http.ResponseWriter, r *http.Request, id string, name string) {
	path, fileName, ok := service.PSDTaskFilePath(strings.TrimSpace(id), strings.TrimSpace(name))
	if !ok {
		Fail(w, "文件不存在")
		return
	}
	if name != "preview" {
		w.Header().Set("Content-Disposition", `attachment; filename="`+fileName+`"`)
	}
	http.ServeFile(w, r, path)
}
