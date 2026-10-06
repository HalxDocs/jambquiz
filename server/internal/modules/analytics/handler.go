package analytics

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/274lab/server/internal/middleware"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Handler struct {
	pool *pgxpool.Pool
}

func RegisterRoutes(r *gin.Engine, pool *pgxpool.Pool, secret string) {
	h := &Handler{pool: pool}
	auth := middleware.RequireAuth(secret)
	admin := middleware.RequireRole("admin")
	r.POST("/api/analytics/log", auth, h.log)
	r.GET("/api/admin/usage", auth, admin, h.usage)
}

func (h *Handler) log(c *gin.Context) {
	if h.pool == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"ok": false, "error": "database unavailable"})
		return
	}
	var in struct {
		StudentID string         `json:"studentId"`
		EventType string         `json:"eventType"`
		Meta      map[string]any `json:"meta"`
	}
	if err := c.ShouldBindJSON(&in); err != nil || in.StudentID == "" || in.EventType == "" {
		c.JSON(http.StatusBadRequest, gin.H{"ok": false, "error": "invalid body"})
		return
	}
	if len(in.EventType) > 50 {
		c.JSON(http.StatusBadRequest, gin.H{"ok": false, "error": "invalid body"})
		return
	}
	u := middleware.Current(c)
	if u.Role != "admin" && u.ID != in.StudentID {
		c.JSON(http.StatusForbidden, gin.H{"ok": false, "error": "forbidden"})
		return
	}
	meta := "null"
	if in.Meta != nil {
		if raw, err := json.Marshal(in.Meta); err == nil {
			meta = string(raw)
		}
	}
	if _, err := h.pool.Exec(c.Request.Context(),
		`INSERT INTO usage_logs (student_id, event_type, meta) VALUES ($1,$2,$3)`,
		in.StudentID, in.EventType, meta); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"ok": false, "error": "internal error"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *Handler) usage(c *gin.Context) {
	if h.pool == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"ok": false, "error": "database unavailable"})
		return
	}
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "100"))
	if limit < 1 || limit > 500 {
		limit = 100
	}
	rs, err := h.pool.Query(c.Request.Context(), `SELECT student_id, event_type, meta, created_at
		FROM usage_logs WHERE ($1='' OR event_type=$1) ORDER BY created_at DESC LIMIT $2`,
		c.Query("eventType"), limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"ok": false, "error": "internal error"})
		return
	}
	defer rs.Close()
	out := []map[string]any{}
	for rs.Next() {
		var sid, et string
		var meta []byte
		var created time.Time
		if err := rs.Scan(&sid, &et, &meta, &created); err == nil {
			out = append(out, map[string]any{"studentId": sid, "eventType": et,
				"meta": string(meta), "createdAt": created.UTC().Format(time.RFC3339)})
		}
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "logs": out})
}
