package handler

import (
	"net/http"

	"github.com/basketikun/infinite-canvas/repository"
)

func CheckAppUpdate(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	platform := q.Get("platform")
	arch := q.Get("arch")
	if platform == "" {
		platform = "win"
	}
	if arch == "" {
		arch = "x64"
	}

	if !repository.ExternalVbenEnabled() {
		OK(w, nil)
		return
	}

	update, err := repository.GetLatestAppUpdate(platform, arch)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, update)
}
