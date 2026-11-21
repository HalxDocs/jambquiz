package analytics

import (
	"context"
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
	cutoff := rangeCutoff(c.Query("range"))
	rs, err := h.pool.Query(c.Request.Context(), `SELECT u.student_id,
			COALESCE(s.name,''), COALESCE(s.nickname,''), COALESCE(s.phone,''),
			u.event_type, u.meta, u.created_at
		FROM usage_logs u
		LEFT JOIN students s ON s.id = u.student_id
		WHERE ($1='' OR u.event_type=$1)
		  AND ($2::timestamptz IS NULL OR u.created_at >= $2)
		ORDER BY u.created_at DESC LIMIT $3`,
		c.Query("eventType"), cutoff, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"ok": false, "error": "internal error"})
		return
	}
	out := []map[string]any{}
	for rs.Next() {
		var sid, name, nickname, phone, et string
		var meta []byte
		var created time.Time
		if err := rs.Scan(&sid, &name, &nickname, &phone, &et, &meta, &created); err == nil {
			out = append(out, map[string]any{"studentId": sid, "studentName": name,
				"nickname": nickname, "phone": phone, "eventType": et,
				"meta": string(meta), "createdAt": created.UTC().Format(time.RFC3339)})
		}
	}
	rs.Close()
	if err := rs.Err(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"ok": false, "error": "internal error"})
		return
	}

	students, err := h.usageStudents(c.Request.Context(), cutoff)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"ok": false, "error": "internal error"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "logs": out, "students": students})
}

// usageStudents aggregates every event in the range, so the admin sees the
// complete list of students rather than only those in the most recent page.
func (h *Handler) usageStudents(ctx context.Context, cutoff *time.Time) ([]map[string]any, error) {
	rs, err := h.pool.Query(ctx, `SELECT u.student_id,
			COALESCE(s.name,''), COALESCE(s.nickname,''), COALESCE(s.phone,''),
			count(*) AS events, max(u.created_at) AS last_at
		FROM usage_logs u
		LEFT JOIN students s ON s.id = u.student_id
		WHERE ($1::timestamptz IS NULL OR u.created_at >= $1)
		GROUP BY u.student_id, s.name, s.nickname, s.phone
		ORDER BY events DESC, last_at DESC
		LIMIT 500`, cutoff)
	if err != nil {
		return nil, err
	}
	defer rs.Close()
	out := []map[string]any{}
	for rs.Next() {
		var sid, name, nickname, phone string
		var events int
		var lastAt time.Time
		if err := rs.Scan(&sid, &name, &nickname, &phone, &events, &lastAt); err == nil {
			out = append(out, map[string]any{"studentId": sid, "studentName": name,
				"nickname": nickname, "phone": phone, "events": events,
				"lastAt": lastAt.UTC().Format(time.RFC3339)})
		}
	}
	return out, rs.Err()
}

// rangeCutoff maps the admin panel's range key to a lower bound. An unknown or
// empty range means no cutoff.
func rangeCutoff(rangeKey string) *time.Time {
	now := time.Now()
	var t time.Time
	switch rangeKey {
	case "7d":
		t = now.AddDate(0, 0, -7)
	case "14d":
		t = now.AddDate(0, 0, -14)
	case "1m":
		t = now.AddDate(0, -1, 0)
	case "1y":
		t = now.AddDate(-1, 0, 0)
	default:
		return nil
	}
	return &t
}
