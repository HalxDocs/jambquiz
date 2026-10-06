package quiz

import (
	"errors"
	"net/http"

	"github.com/274lab/server/internal/middleware"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Handler struct {
	svc *Service
}

func RegisterRoutes(r *gin.Engine, pool *pgxpool.Pool, secret string) {
	h := &Handler{svc: NewService(pool)}
	auth := middleware.RequireAuth(secret)
	r.POST("/api/quiz/start", auth, h.start)
	r.POST("/api/quiz/submit", auth, h.submit)
	r.POST("/api/quiz/details", auth, h.details)
	r.POST("/api/quiz/consume-trial", auth, h.consumeTrial)
}

func unavailable(c *gin.Context, svc *Service) bool {
	if svc.pool == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"ok": false, "error": "database unavailable"})
		return true
	}
	return false
}

func fail(c *gin.Context, err error) {
	switch {
	case errors.Is(err, ErrNotFound):
		c.JSON(http.StatusNotFound, gin.H{"ok": false, "error": err.Error()})
	case errors.Is(err, ErrForbidden):
		c.JSON(http.StatusForbidden, gin.H{"ok": false, "error": err.Error()})
	case errors.Is(err, ErrLocked) || errors.Is(err, ErrExpired) || errors.Is(err, ErrSuspended) ||
		errors.Is(err, ErrMalformed) || errors.Is(err, ErrNoSubjects) || errors.Is(err, ErrDeadline):
		c.JSON(http.StatusBadRequest, gin.H{"ok": false, "error": err.Error()})
	case errors.Is(err, ErrRateLimited):
		c.JSON(http.StatusTooManyRequests, gin.H{"ok": false, "error": err.Error()})
	default:
		c.JSON(http.StatusInternalServerError, gin.H{"ok": false, "error": "internal error"})
	}
}

func (h *Handler) start(c *gin.Context) {
	if unavailable(c, h.svc) {
		return
	}
	var in struct {
		StudentID     string `json:"studentId"`
		Week          string `json:"week"`
		RetakeSubject string `json:"retakeSubject"`
	}
	if err := c.ShouldBindJSON(&in); err != nil || in.StudentID == "" || in.Week == "" {
		c.JSON(http.StatusBadRequest, gin.H{"ok": false, "error": "invalid body"})
		return
	}
	u := middleware.Current(c)
	if u.ID != in.StudentID && u.Role != "admin" {
		c.JSON(http.StatusForbidden, gin.H{"ok": false, "error": "forbidden"})
		return
	}
	res, err := h.svc.Start(c.Request.Context(), u.ID, in.StudentID, in.Week, in.RetakeSubject)
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "sessionId": res.SessionID, "week": res.Week,
		"questions": res.Questions, "isRetake": res.IsRetake})
}

func (h *Handler) submit(c *gin.Context) {
	if unavailable(c, h.svc) {
		return
	}
	var in struct {
		SessionID string           `json:"sessionId"`
		Answers   map[string][]int `json:"answers"`
	}
	if err := c.ShouldBindJSON(&in); err != nil || in.SessionID == "" || in.Answers == nil {
		c.JSON(http.StatusBadRequest, gin.H{"ok": false, "error": "invalid body"})
		return
	}
	u := middleware.Current(c)
	res, err := h.svc.Submit(c.Request.Context(), u.ID, in.SessionID, in.Answers)
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "results": res.Results, "scoreId": res.ScoreID,
		"alreadySubmitted": res.AlreadySubmitted, "earnedCoins": res.EarnedCoins})
}

func (h *Handler) details(c *gin.Context) {
	if unavailable(c, h.svc) {
		return
	}
	var in struct {
		StudentID string `json:"studentId"`
		Week      string `json:"week"`
	}
	if err := c.ShouldBindJSON(&in); err != nil || in.StudentID == "" || in.Week == "" {
		c.JSON(http.StatusBadRequest, gin.H{"ok": false, "error": "invalid body"})
		return
	}
	u := middleware.Current(c)
	res, err := h.svc.Details(c.Request.Context(), u.ID, u.Role, in.StudentID, in.Week)
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "released": res.Released,
		"subjects": res.Subjects, "answers": res.Answers})
}

func (h *Handler) consumeTrial(c *gin.Context) {
	if unavailable(c, h.svc) {
		return
	}
	var in struct {
		StudentID string `json:"studentId"`
	}
	if err := c.ShouldBindJSON(&in); err != nil || in.StudentID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"ok": false, "error": "invalid body"})
		return
	}
	u := middleware.Current(c)
	if u.ID != in.StudentID && u.Role != "admin" {
		c.JSON(http.StatusForbidden, gin.H{"ok": false, "error": "forbidden"})
		return
	}
	res, err := h.svc.ConsumeTrial(c.Request.Context(), u.ID, in.StudentID)
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "consumed": res.Consumed, "freeAttemptsUsed": res.FreeAttemptsUsed})
}
