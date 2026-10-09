package notify

import (
	"errors"
	"net/http"
	"time"

	"github.com/274lab/server/internal/middleware"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Handler struct {
	svc *Service
}

func RegisterRoutes(r *gin.Engine, pool *pgxpool.Pool, cfg Config, secret string) *Service {
	return RegisterService(r, pool, secret, cfg)
}

func RegisterService(r *gin.Engine, pool *pgxpool.Pool, secret string, cfg Config) *Service {
	h := &Handler{svc: NewService(pool, cfg)}
	auth := middleware.RequireAuth(secret)
	admin := middleware.RequireRole("admin")

	r.GET("/api/admin/broadcasts", auth, admin, h.list)
	r.POST("/api/admin/broadcasts", auth, admin, h.create)
	r.POST("/api/admin/test-push", auth, admin, h.testPush)
	r.POST("/api/admin/test-sms", auth, admin, h.testSMS)
	r.POST("/api/notify/accountability-intro", auth, h.intro)
	r.POST("/api/notify/welcome-sms", auth, h.welcome)
	r.POST("/api/push/subscribe", h.subscribe)
	r.POST("/api/admin/sms/clear-guards", auth, admin, h.clearGuards)
	r.GET("/api/admin/sms/debug", auth, admin, h.debugSMS)
	r.GET("/api/admin/settings/notifications", auth, admin, h.notifGet)
	r.PUT("/api/admin/settings/notifications", auth, admin, h.notifSet)
	return h.svc
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
	case errors.Is(err, errNotFound):
		c.JSON(http.StatusNotFound, gin.H{"ok": false, "error": err.Error()})
	case errors.Is(err, errBadInput) || errors.Is(err, errForbidden):
		c.JSON(http.StatusBadRequest, gin.H{"ok": false, "error": err.Error()})
	case errors.Is(err, errRateLimited):
		c.JSON(http.StatusTooManyRequests, gin.H{"ok": false, "error": err.Error()})
	case errors.Is(err, errNotConfigured):
		c.JSON(http.StatusFailedDependency, gin.H{"ok": false, "error": err.Error()})
	default:
		c.JSON(http.StatusInternalServerError, gin.H{"ok": false, "error": err.Error()})
	}
}

func ownerOrAdmin(c *gin.Context, studentID string) bool {
	u := middleware.Current(c)
	if u.Role == "admin" || u.ID == studentID {
		return true
	}
	c.JSON(http.StatusForbidden, gin.H{"ok": false, "error": "forbidden"})
	return false
}

func (h *Handler) list(c *gin.Context) {
	if unavailable(c, h.svc) {
		return
	}
	rows, err := h.svc.pool.Query(c.Request.Context(),
		`SELECT id, title, message, target, created_at FROM admin_broadcasts ORDER BY created_at DESC LIMIT 50`)
	if err != nil {
		fail(c, err)
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, title, message, target string
		var created time.Time
		if err := rows.Scan(&id, &title, &message, &target, &created); err == nil {
			out = append(out, map[string]any{"id": id, "title": title,
				"message": message, "target": target, "createdAt": created.UTC().Format(time.RFC3339)})
		}
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "broadcasts": out})
}

func (h *Handler) create(c *gin.Context) {
	if unavailable(c, h.svc) {
		return
	}
	var in struct {
		Title   string `json:"title"`
		Message string `json:"message"`
		Target  string `json:"target"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"ok": false, "error": "invalid body"})
		return
	}
	id, sent, err := h.svc.CreateBroadcast(c.Request.Context(), in.Title, in.Message, in.Target)
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "id": id, "sent": sent})
}

func (h *Handler) testPush(c *gin.Context) {
	if unavailable(c, h.svc) {
		return
	}
	sent, total, err := h.svc.TestPush(c.Request.Context())
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "sent": sent, "total": total})
}

func (h *Handler) testSMS(c *gin.Context) {
	if unavailable(c, h.svc) {
		return
	}
	var in struct {
		Phone string `json:"phone"`
	}
	if err := c.ShouldBindJSON(&in); err != nil || in.Phone == "" {
		c.JSON(http.StatusBadRequest, gin.H{"ok": false, "error": "invalid body"})
		return
	}
	if err := h.svc.TestSMS(c.Request.Context(), in.Phone); err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *Handler) intro(c *gin.Context) {
	if unavailable(c, h.svc) {
		return
	}
	var in struct {
		StudentID string   `json:"studentId"`
		Phones    []string `json:"phones"`
	}
	if err := c.ShouldBindJSON(&in); err != nil || in.StudentID == "" || len(in.Phones) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"ok": false, "error": "invalid body"})
		return
	}
	if !ownerOrAdmin(c, in.StudentID) {
		return
	}
	sent, err := h.svc.AccountabilityIntro(c.Request.Context(), in.StudentID, in.Phones)
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "sentCount": sent})
}

func (h *Handler) welcome(c *gin.Context) {
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
	if !ownerOrAdmin(c, in.StudentID) {
		return
	}
	sent, err := h.svc.WelcomeSMS(c.Request.Context(), in.StudentID)
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "sentCount": sent})
}

func (h *Handler) clearGuards(c *gin.Context) {
	if unavailable(c, h.svc) {
		return
	}
	ctx := c.Request.Context()
	var deleted int
	r1, _ := h.svc.pool.Exec(ctx, `DELETE FROM reminder_sent`)
	deleted += int(r1.RowsAffected())
	r2, _ := h.svc.pool.Exec(ctx, `DELETE FROM admin_settings
		WHERE id LIKE 'quiz_sms_%' OR id LIKE 'absent_sms_%' OR id LIKE 'advance_week_%'`)
	deleted += int(r2.RowsAffected())
	c.JSON(http.StatusOK, gin.H{"ok": true, "deleted": deleted})
}

func (h *Handler) debugSMS(c *gin.Context) {
	if unavailable(c, h.svc) {
		return
	}
	ctx := c.Request.Context()
	week := h.svc.activeWeek(ctx)
	qd := h.svc.getQuizDates(ctx, week)
	var scoreCount int
	_ = h.svc.pool.QueryRow(ctx, `SELECT count(*) FROM scores WHERE week=$1`, week).Scan(&scoreCount)
	var studentCount int
	_ = h.svc.pool.QueryRow(ctx, `SELECT count(*) FROM students`).Scan(&studentCount)
	var guards int
	_ = h.svc.pool.QueryRow(ctx, `SELECT count(*) FROM reminder_sent`).Scan(&guards)
	c.JSON(http.StatusOK, gin.H{"ok": true, "week": week,
		"quizDates":      map[string]string{"date1": qd.Date1, "date2": qd.Date2},
		"scoresThisWeek": scoreCount, "students": studentCount,
		"reminderGuards": guards, "termiiConfigured": h.svc.cfg.TermiiKey != "",
		"pushConfigured": h.svc.sender.Configured()})
}

func (h *Handler) subscribe(c *gin.Context) {
	if unavailable(c, h.svc) {
		return
	}
	var in struct {
		StudentID string `json:"studentId"`
		Endpoint  string `json:"endpoint"`
		Keys      struct {
			P256dh string `json:"p256dh"`
			Auth   string `json:"auth"`
		} `json:"keys"`
	}
	if err := c.ShouldBindJSON(&in); err != nil || in.StudentID == "" || in.Endpoint == "" ||
		in.Keys.P256dh == "" || in.Keys.Auth == "" {
		c.JSON(http.StatusBadRequest, gin.H{"ok": false, "error": "invalid body"})
		return
	}
	if len(in.Endpoint) > 2048 {
		c.JSON(http.StatusBadRequest, gin.H{"ok": false, "error": "invalid body"})
		return
	}
	if err := h.svc.SaveSubscription(c.Request.Context(), in.StudentID, in.Endpoint, in.Keys.P256dh, in.Keys.Auth); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"ok": false, "error": "internal error"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *Handler) notifGet(c *gin.Context) {
	if unavailable(c, h.svc) {
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "enabled": !h.svc.notificationsDisabled(c.Request.Context())})
}

func (h *Handler) notifSet(c *gin.Context) {
	if unavailable(c, h.svc) {
		return
	}
	var in struct {
		Enabled bool `json:"enabled"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"ok": false, "error": "invalid body"})
		return
	}
	if _, err := h.svc.pool.Exec(c.Request.Context(), `INSERT INTO admin_settings (id, data)
		VALUES ('notifications', jsonb_build_object('enabled', $1::bool)) ON CONFLICT (id) DO UPDATE
		SET data = jsonb_build_object('enabled', $1::bool), updated_at = now()`, in.Enabled); err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "enabled": in.Enabled})
}
