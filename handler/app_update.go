package handler

import (
	"net/http"
)

func CheckAppUpdate(w http.ResponseWriter, r *http.Request) {
	OK(w, nil)
}
