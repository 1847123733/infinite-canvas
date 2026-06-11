//go:build embed

package main

import (
	"embed"
	"io/fs"
	"log"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

//go:embed web/out
var staticFiles embed.FS

func serveStaticSPA(r *gin.Engine) {
	staticFS, err := fs.Sub(staticFiles, "web/out")
	if err != nil {
		log.Printf("WARNING: embedded static files not available: %v", err)
		return
	}

	r.NoRoute(func(c *gin.Context) {
		path := c.Request.URL.Path

		// API paths that don't match any route return 404 JSON.
		if strings.HasPrefix(path, "/api/") {
			c.JSON(http.StatusNotFound, gin.H{"code": 1, "data": nil, "msg": "接口不存在"})
			return
		}

		// WebDAV proxy endpoint — handled separately if needed.
		if strings.HasPrefix(path, "/webdav-proxy") {
			c.JSON(http.StatusNotFound, gin.H{"code": 1, "data": nil, "msg": "接口不存在"})
			return
		}

		// Remove leading slash for fs lookup
		cleanPath := strings.TrimPrefix(path, "/")
		if cleanPath == "" {
			cleanPath = "index.html"
		}

		// Try to open the exact file
		f, err := staticFS.Open(cleanPath)
		if err == nil {
			stat, statErr := f.Stat()
			if statErr == nil && !stat.IsDir() {
				defer f.Close()
				http.ServeContent(c.Writer, c.Request, cleanPath, stat.ModTime(), f.(http.File))
				return
			}
			f.Close()
		}

		// Try with .html extension if not found
		if !strings.HasSuffix(cleanPath, ".html") && !strings.Contains(cleanPath, ".") {
			f, err = staticFS.Open(cleanPath + ".html")
			if err == nil {
				stat, statErr := f.Stat()
				if statErr == nil && !stat.IsDir() {
					defer f.Close()
					http.ServeContent(c.Writer, c.Request, cleanPath+".html", stat.ModTime(), f.(http.File))
					return
				}
				f.Close()
			}
		}

		// SPA fallback: serve index.html for unmatched routes
		index, err := staticFS.Open("index.html")
		if err != nil {
			c.String(http.StatusInternalServerError, "前端资源未找到，请重新构建前端")
			return
		}
		defer index.Close()

		stat, err := index.Stat()
		if err != nil {
			c.String(http.StatusInternalServerError, "前端资源读取失败")
			return
		}

		c.Header("Cache-Control", "no-cache")
		http.ServeContent(c.Writer, c.Request, "index.html", stat.ModTime(), index.(http.File))
	})

	log.Println("Static file serving with SPA fallback enabled (embed mode)")
}