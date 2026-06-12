package main

import (
	"log"

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
	addr := config.Cfg.BindAddr + ":" + config.Cfg.Port
	log.Printf("Starting server on %s", addr)
	log.Fatal(router.New().Run(addr))
}
