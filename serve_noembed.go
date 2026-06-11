//go:build !embed

package main

import (
	"log"

	"github.com/gin-gonic/gin"
)

func serveStaticSPA(r *gin.Engine) {
	// No embedded static files in dev mode.
	// The frontend is expected to run separately (e.g. bun run dev).
	// NoRoute is already set to NotFoundJSON by router.New().
	log.Println("Running in API-only mode (no embedded frontend)")
}
