package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/274lab/server/internal/config"
	"github.com/274lab/server/internal/db"
	"github.com/274lab/server/internal/modules/auth"
	"github.com/274lab/server/internal/modules/quiz"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
)

func main() {
	cfg := config.Load()
	if cfg.Env == "prod" {
		gin.SetMode(gin.ReleaseMode)
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	var pool *pgxpool.Pool
	if p, err := db.NewPool(ctx, cfg.DatabaseURL); err != nil {
		log.Printf("[db] unavailable at boot: %v (health will report down)", err)
	} else {
		pool = p
		defer pool.Close()
	}

	r := gin.Default()
	auth.RegisterRoutes(r, pool, cfg.JWTSecret)
	quiz.RegisterRoutes(r, pool, cfg.JWTSecret)
	r.GET("/healthz", func(c *gin.Context) {
		status := "up"
		code := http.StatusOK
		if pool == nil {
			status = "degraded"
		} else if err := pool.Ping(c.Request.Context()); err != nil {
			status = "down"
			code = http.StatusServiceUnavailable
		}
		c.JSON(code, gin.H{"ok": code == http.StatusOK, "service": "274lab-server", "db": status})
	})

	srv := &http.Server{Addr: ":" + cfg.Port, Handler: r}
	go func() {
		log.Printf("[api] listening on :%s (env=%s)", cfg.Port, cfg.Env)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("[api] listen: %v", err)
		}
	}()

	<-ctx.Done()
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Printf("[api] shutdown: %v", err)
	}
}
