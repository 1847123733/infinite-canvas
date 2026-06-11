package main

import (
	"fmt"
	"log"
	"os/exec"
	"runtime"
	"time"

	"github.com/basketikun/infinite-canvas/config"
	"github.com/basketikun/infinite-canvas/router"
	"github.com/basketikun/infinite-canvas/service"
)

func main() {
	if err := config.Load(); err != nil {
		log.Fatal(err)
	}
	if err := service.EnsureDefaultAdmin(); err != nil {
		log.Fatal(err)
	}
	service.StartPromptSyncScheduler()

	r := router.New()

	// Serve embedded static frontend files (with SPA fallback).
	// In dev mode (!embed build tag) this is a no-op.
	serveStaticSPA(r)

	// Open the browser after a short delay (give the server time to start).
	go func() {
		time.Sleep(500 * time.Millisecond)
		url := fmt.Sprintf("http://localhost:%s", config.Cfg.Port)
		if err := openBrowser(url); err != nil {
			log.Printf("Failed to open browser: %v", err)
		}
	}()

	log.Printf("Infinite Canvas server starting on http://localhost:%s", config.Cfg.Port)
	log.Fatal(r.Run(":" + config.Cfg.Port))
}

func openBrowser(url string) error {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "windows":
		cmd = exec.Command("rundll32", "url.dll,FileProtocolHandler", url)
	case "darwin":
		cmd = exec.Command("open", url)
	default:
		cmd = exec.Command("xdg-open", url)
	}
	return cmd.Start()
}
