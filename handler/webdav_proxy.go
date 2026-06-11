package handler

import (
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const webdavProxyTimeout = 120 * time.Second

func WebdavProxy(w http.ResponseWriter, r *http.Request) {
	target := r.Header.Get("x-webdav-target")
	method := strings.ToUpper(r.Header.Get("x-webdav-method"))
	if method == "" {
		method = http.MethodGet
	}
	targetURL, err := url.Parse(target)
	if err != nil || targetURL == nil || targetURL.Scheme == "" || targetURL.Host == "" {
		http.Error(w, "Invalid x-webdav-target", http.StatusBadRequest)
		return
	}
	if targetURL.Scheme != "http" && targetURL.Scheme != "https" {
		http.Error(w, "Unsupported WebDAV target", http.StatusBadRequest)
		return
	}

	var body io.Reader
	if method != http.MethodGet && method != http.MethodHead {
		body = r.Body
	}
	request, err := http.NewRequestWithContext(r.Context(), method, targetURL.String(), body)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	copyWebdavProxyHeader(r, request, "x-webdav-authorization", "Authorization")
	copyWebdavProxyHeader(r, request, "x-webdav-depth", "Depth")
	copyWebdavProxyHeader(r, request, "x-webdav-destination", "Destination")
	copyWebdavProxyHeader(r, request, "x-webdav-overwrite", "Overwrite")
	copyWebdavProxyHeader(r, request, "x-webdav-content-type", "Content-Type")

	client := http.Client{Timeout: webdavProxyTimeout}
	response, err := client.Do(request)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}
	defer response.Body.Close()

	copyWebdavResponseHeader(w, response.Header, "Content-Type")
	copyWebdavResponseHeader(w, response.Header, "ETag")
	copyWebdavResponseHeader(w, response.Header, "Last-Modified")
	copyWebdavResponseHeader(w, response.Header, "DAV")
	w.WriteHeader(response.StatusCode)
	if method != http.MethodHead {
		_, _ = io.Copy(w, response.Body)
	}
}

func copyWebdavProxyHeader(from *http.Request, to *http.Request, source string, target string) {
	if value := from.Header.Get(source); value != "" {
		to.Header.Set(target, value)
	}
}

func copyWebdavResponseHeader(w http.ResponseWriter, headers http.Header, key string) {
	if value := headers.Get(key); value != "" {
		w.Header().Set(key, value)
	}
}
