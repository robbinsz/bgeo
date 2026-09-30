package main

import (
	"context"
	"github.com/robbinsz/bgeo/internal/config"
	"github.com/robbinsz/bgeo/internal/repository"
	"github.com/robbinsz/bgeo/internal/usecase"
	"log"
	"os/signal"
	"syscall"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatal(err)
	}
	db, err := repository.OpenDatabase(cfg)
	if err != nil {
		log.Fatal(err)
	}
	conn, err := db.DB()
	if err != nil {
		log.Fatal(err)
	}
	defer conn.Close()
	ctx, cancel := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer cancel()
	if err = repository.VerifySchema(ctx, db); err != nil {
		log.Fatal(err)
	}
	if err = usecase.NewWorker(db, cfg, nil).Run(ctx); err != nil {
		log.Fatal(err)
	}
}
