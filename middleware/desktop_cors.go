package middleware

import (
	"net/http"
	"strings"

	"github.com/basketikun/infinite-canvas/config"
	"github.com/gin-gonic/gin"
)

func DesktopCORS(c *gin.Context) {
	if !config.Cfg.DesktopMode {
		c.Next()
		return
	}
	origin := c.GetHeader("Origin")
	if isDesktopOrigin(origin) {
		c.Header("Access-Control-Allow-Origin", origin)
		c.Header("Vary", "Origin")
	}
	c.Header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS,HEAD")
	c.Header("Access-Control-Allow-Headers", "Authorization,Content-Type,Depth,Destination,Overwrite,X-Webdav-Authorization,X-Webdav-Content-Type,X-Webdav-Depth,X-Webdav-Destination,X-Webdav-Method,X-Webdav-Overwrite,X-Webdav-Target")
	c.Header("Access-Control-Expose-Headers", "Content-Type,Content-Length,ETag,Last-Modified,DAV")
	if c.Request.Method == http.MethodOptions {
		c.AbortWithStatus(http.StatusNoContent)
		return
	}
	c.Next()
}

func isDesktopOrigin(origin string) bool {
	if origin == "" || origin == "null" || origin == "tauri://localhost" {
		return true
	}
	return strings.HasPrefix(origin, "http://tauri.localhost") || strings.HasPrefix(origin, "https://tauri.localhost") || strings.HasPrefix(origin, "http://localhost:") || strings.HasPrefix(origin, "http://127.0.0.1:")
}
