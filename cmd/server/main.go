package main

import (
	"context"
	"github.com/gin-gonic/gin"
	"github.com/robbinsz/bgeo/internal/config"
	delivery "github.com/robbinsz/bgeo/internal/delivery/http"
	"github.com/robbinsz/bgeo/internal/delivery/ws"
	"github.com/robbinsz/bgeo/internal/repository"
	"log"
	"net/http"
	"os/signal"
	"syscall"
	"time"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatal(err)
	}
	if cfg.Environment == "production" {
		gin.SetMode(gin.ReleaseMode)
	}
	db, err := repository.InitDB()
	if err != nil {
		log.Fatal(err)
	}
	conn, err := db.DB()
	if err != nil {
		log.Fatal(err)
	}
	defer conn.Close()
	hub := ws.InitGlobalHub()
	defer hub.Close()
	ctx, cancel := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer cancel()
	server := &http.Server{Addr: cfg.Address, Handler: delivery.SetupRouterWithDB(db, hub), ReadHeaderTimeout: 10 * time.Second, ReadTimeout: 30 * time.Second, IdleTimeout: 60 * time.Second, MaxHeaderBytes: 1 << 20}
	go func() {
		<-ctx.Done()
		shutdown, stop := context.WithTimeout(context.Background(), 20*time.Second)
		defer stop()
		server.Shutdown(shutdown)
	}()
	log.Printf("HTTP server listening on %s (mode=%s)", cfg.Address, cfg.Mode)
	if err = server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatal(err)
	}
}
