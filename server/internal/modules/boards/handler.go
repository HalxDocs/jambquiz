package boards

import (
	"net/http"
	"strconv"
	"time"

	"github.com/274lab/server/internal/middleware"
	"github.com/274lab/server/internal/ratelimit"
	"github.com/274lab/server/pkg/ids"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Handler struct {
	svc *Service
}

func RegisterRoutes(r *gin.Engine, pool *pgxpool.Pool, secret string) {
	h := &Handler{svc: NewService(pool)}
	auth := middleware.RequireAuth(secret)
	admin := middleware.RequireRole("admin")

	r.GET("/api/portal/stats", h.portal)
	r.GET("/api/portal/board/:id", h.board)
	r.GET("/api/guestbook", h.guestbookList)
	r.POST("/api/guestbook", h.guestbookPost)
	r.POST("/api/admin/boards/refresh", auth, admin, h.refresh)
	r.GET("/api/admin/stats", auth, admin, h.adminStats)
	r.GET("/api/admin/growth", auth, admin, h.growth)
}

func unavailable(c *gin.Context, svc *Service) bool {
	if svc.pool == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"ok": false, "error": "database unavailable"})
		return true
	}
	return false
}

func (h *Handler) portal(c *gin.Context) {
	if unavailable(c, h.svc) {
		return
	}
	stats := h.svc.PortalStats(c.Request.Context())
	c.JSON(http.StatusOK, gin.H{"ok": true, "stats": stats})
}

func (h *Handler) board(c *gin.Context) {
	if unavailable(c, h.svc) {
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "top": h.svc.Board(c.Request.Context(), c.Param("id"))})
}

func (h *Handler) refresh(c *gin.Context) {
	if unavailable(c, h.svc) {
		return
	}
	ctx := c.Request.Context()
	if err := h.svc.ComputeLeaderboard(ctx); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"ok": false, "error": "leaderboard failed"})
		return
	}
	if err := h.svc.RefreshPublicStats(ctx); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"ok": false, "error": "stats failed"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *Handler) adminStats(c *gin.Context) {
	if unavailable(c, h.svc) {
		return
	}
	stats, err := h.svc.AdminStats(c.Request.Context(), c.Query("year"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"ok": false, "error": "internal error"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "stats": stats})
}

func (h *Handler) growth(c *gin.Context) {
	if unavailable(c, h.svc) {
		return
	}
	g, err := h.svc.GrowthStats(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"ok": false, "error": "internal error"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "referrals": g.Referrals, "squads": g.Squads, "lifelines": g.Lifelines})
}

func (h *Handler) guestbookList(c *gin.Context) {
	if unavailable(c, h.svc) {
		return
	}
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
	if limit < 1 || limit > 100 {
		limit = 50
	}
	rows, err := h.svc.pool.Query(c.Request.Context(),
		`SELECT id, name, message, signature, created_at FROM guestbook ORDER BY created_at DESC LIMIT $1`, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"ok": false, "error": "failed to fetch entries"})
		return
	}
	defer rows.Close()
	entries := []map[string]any{}
	for rows.Next() {
		var id, name, message, sig string
		var created time.Time
		if err := rows.Scan(&id, &name, &message, &sig, &created); err == nil {
			entries = append(entries, map[string]any{"id": id, "name": name,
				"message": message, "signature": sig, "createdAt": created.UTC().Format(time.RFC3339)})
		}
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "entries": entries})
}

func (h *Handler) guestbookPost(c *gin.Context) {
	if unavailable(c, h.svc) {
		return
	}
	if !ratelimit.Allow(c.Request.Context(), h.svc.pool, "guestbook:"+c.ClientIP(), 5, 60*60*1000) {
		c.JSON(http.StatusTooManyRequests, gin.H{"ok": false, "error": "Too many entries. Try again later."})
		return
	}
	var in struct {
		Name      string `json:"name"`
		Message   string `json:"message"`
		Signature string `json:"signature"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"ok": false, "error": "invalid body"})
		return
	}
	name := in.Name
	if len(name) > 200 {
		name = name[:200]
	}
	name = trimSpace(name)
	if name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"ok": false, "error": "Name is required"})
		return
	}
	if len(name) > 60 {
		name = name[:60]
	}
	msg := trimSpace(in.Message)
	if len(msg) > 500 {
		msg = msg[:500]
	}
	id := ids.New()
	if _, err := h.svc.pool.Exec(c.Request.Context(), `INSERT INTO guestbook (id, name, message, signature, ip)
		VALUES ($1,$2,$3,$4,$5)`, id, name, msg, in.Signature, c.ClientIP()); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"ok": false, "error": "Failed to save entry"})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"ok": true, "id": id})
}

func trimSpace(s string) string {
	out := s
	for len(out) > 0 && (out[0] == ' ' || out[0] == '\n' || out[0] == '\t' || out[0] == '\r') {
		out = out[1:]
	}
	for len(out) > 0 && (out[len(out)-1] == ' ' || out[len(out)-1] == '\n' || out[len(out)-1] == '\t' || out[len(out)-1] == '\r') {
		out = out[:len(out)-1]
	}
	return out
}
