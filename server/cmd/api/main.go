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
	"github.com/274lab/server/internal/modules/analytics"
	"github.com/274lab/server/internal/modules/auth"
	"github.com/274lab/server/internal/modules/boards"
	"github.com/274lab/server/internal/modules/coins"
	"github.com/274lab/server/internal/modules/content"
	"github.com/274lab/server/internal/modules/notify"
	"github.com/274lab/server/internal/modules/payments"
	"github.com/274lab/server/internal/modules/quiz"
	"github.com/274lab/server/internal/modules/students"
	"github.com/274lab/server/internal/modules/teachers"
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
	r.Use(corsMiddleware())
	auth.RegisterRoutes(r, pool, cfg.JWTSecret, cfg.TermiiKey, cfg.TermiiSender)
	quizSvc := quiz.RegisterRoutes(r, pool, cfg.JWTSecret)
	notifySvc := notify.RegisterService(r, pool, cfg.JWTSecret, notify.Config{
		VapidPublic: cfg.VapidPublic, VapidPrivate: cfg.VapidPrivate,
		VapidSubject: cfg.VapidSubject, TermiiKey: cfg.TermiiKey, TermiiSender: cfg.TermiiSender,
	})
	if cfg.TermiiKey != "" {
		quizSvc.OnSubmit = func(ctx context.Context, studentID, week string, results []quiz.SubjectResult) {
			mapped := make([]map[string]any, len(results))
			for i, res := range results {
				mapped[i] = map[string]any{"subject": res.Subject, "score": res.Score}
			}
			notifySvc.SendRealtimeResultSMS(ctx, studentID, week, mapped)
		}
	}
	coins.RegisterRoutes(r, pool, cfg.JWTSecret)
	content.RegisterRoutes(r, pool, cfg.JWTSecret)
	analytics.RegisterRoutes(r, pool, cfg.JWTSecret)
	boards.RegisterRoutes(r, pool, cfg.JWTSecret)
	students.RegisterRoutes(r, pool, cfg.JWTSecret)
	teachers.RegisterRoutes(r, pool, cfg.JWTSecret, cfg.PaystackSecret)
	payments.RegisterRoutes(r, pool, cfg.JWTSecret, payments.Config{
		PaystackSecret:       cfg.PaystackSecret,
		PaystackCallbackURL:  cfg.PaystackCallbackURL,
		BachsAPIKey:          cfg.BachsAPIKey,
		BachsSubProductID:    cfg.BachsSubProductID,
		BachsResumeProductID: cfg.BachsResumeProductID,
		BachsWebhookToken:    cfg.BachsWebhookToken,
		BachsWebhookSecret:   cfg.BachsWebhookSecret,
	})
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

// corsMiddleware allows the web frontends (custom domain, Firebase
// Hosting, Vercel, local dev) to call the API from browsers.
func corsMiddleware() gin.HandlerFunc {
	allowed := map[string]bool{
		"https://www.274lab.com":                    true,
		"https://274lab.com":                        true,
		"https://fitness-gym-fc040.web.app":         true,
		"https://fitness-gym-fc040.firebaseapp.com": true,
		"http://localhost:5173":                     true,
		"http://localhost:3000":                     true,
	}
	return func(c *gin.Context) {
		origin := c.GetHeader("Origin")
		allow := allowed[origin]
		if !allow && len(origin) > 8 {
			// Any vercel.app preview/production deployment.
			allow = len(origin) >= 18 && origin[len(origin)-11:] == ".vercel.app" &&
				(origin[:8] == "https://")
		}
		if allow {
			c.Header("Access-Control-Allow-Origin", origin)
			c.Header("Vary", "Origin")
		}
		c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Authorization, Content-Type")
		c.Header("Access-Control-Max-Age", "86400")
		if c.Request.Method == http.MethodOptions {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		c.Next()
	}
}
