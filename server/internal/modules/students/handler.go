package students

import (
	"errors"
	"net/http"
	"strconv"

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
	admin := middleware.RequireRole("admin")

	r.PATCH("/api/students/:id", auth, h.update)
	r.GET("/api/students/:id/status", auth, h.status)
	r.POST("/api/students/verify-recovery", auth, h.verifyRecovery)

	r.GET("/api/admin/students", auth, admin, h.list)
	r.POST("/api/admin/students/:id/grant", auth, admin, h.grant)
	r.DELETE("/api/admin/students/:id", auth, admin, h.delete)
}

func unavailable(c *gin.Context, svc *Service) bool {
	if svc.pool == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"ok": false, "error": "database unavailable"})
		return true
	}
	return false
}

func ownerOrAdmin(c *gin.Context, id string) bool {
	u := middleware.Current(c)
	if u.Role == "admin" || u.ID == id {
		return true
	}
	c.JSON(http.StatusForbidden, gin.H{"ok": false, "error": "forbidden"})
	return false
}

func fail(c *gin.Context, err error) {
	switch {
	case errors.Is(err, ErrNotFound):
		c.JSON(http.StatusNotFound, gin.H{"ok": false, "error": err.Error()})
	case errors.Is(err, ErrForbidden):
		c.JSON(http.StatusForbidden, gin.H{"ok": false, "error": err.Error()})
	case errors.Is(err, ErrBadInput) || errors.Is(err, ErrRateLimited) || errors.Is(err, ErrNameTaken):
		c.JSON(http.StatusBadRequest, gin.H{"ok": false, "error": err.Error()})
	default:
		c.JSON(http.StatusInternalServerError, gin.H{"ok": false, "error": "internal error"})
	}
}

func (h *Handler) update(c *gin.Context) {
	if unavailable(c, h.svc) {
		return
	}
	id := c.Param("id")
	if !ownerOrAdmin(c, id) {
		return
	}
	var raw map[string]any
	if err := c.ShouldBindJSON(&raw); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"ok": false, "error": "invalid body"})
		return
	}
	var in UpdateInput
	str := func(k string) *string {
		if v, ok := raw[k].(string); ok {
			return &v
		}
		return nil
	}
	in.Name = str("name")
	in.Nickname = str("nickname")
	in.Email = str("email")
	in.Phone = str("phone")
	in.ParentPhone = str("parentPhone")
	in.TeacherPhone = str("teacherPhone")
	if subs, ok := raw["subjects"].([]any); ok {
		in.HasSubjects = true
		in.Subjects = []string{}
		for _, s := range subs {
			if str, ok := s.(string); ok {
				in.Subjects = append(in.Subjects, str)
			}
		}
	}
	st, err := h.svc.Update(c.Request.Context(), id, in)
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "student": st})
}

func (h *Handler) status(c *gin.Context) {
	if unavailable(c, h.svc) {
		return
	}
	id := c.Param("id")
	if !ownerOrAdmin(c, id) {
		return
	}
	st, err := h.svc.Status(c.Request.Context(), id)
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "status": st.Status,
		"freeAttemptsLeft": st.FreeAttemptsLeft, "trialDaysLeft": st.TrialDaysLeft})
}

func (h *Handler) verifyRecovery(c *gin.Context) {
	if unavailable(c, h.svc) {
		return
	}
	var in struct {
		StudentID string `json:"studentId"`
		Code      string `json:"code"`
	}
	if err := c.ShouldBindJSON(&in); err != nil || in.StudentID == "" || in.Code == "" {
		c.JSON(http.StatusBadRequest, gin.H{"ok": false, "error": "invalid body"})
		return
	}
	if !ownerOrAdmin(c, in.StudentID) {
		return
	}
	u := middleware.Current(c)
	ok, _, err := h.svc.VerifyRecovery(c.Request.Context(), u.ID, in.StudentID, in.Code)
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": ok})
}

func (h *Handler) list(c *gin.Context) {
	if unavailable(c, h.svc) {
		return
	}
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "20"))
	p, err := h.svc.List(c.Request.Context(), c.Query("year"), page, pageSize)
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "students": p.Students, "total": p.Total,
		"page": p.Page, "pageSize": p.PageSize})
}

func (h *Handler) grant(c *gin.Context) {
	if unavailable(c, h.svc) {
		return
	}
	var in struct {
		Expiry string `json:"expiry"`
	}
	if err := c.ShouldBindJSON(&in); err != nil || in.Expiry == "" {
		c.JSON(http.StatusBadRequest, gin.H{"ok": false, "error": "invalid body"})
		return
	}
	iso, err := h.svc.Grant(c.Request.Context(), c.Param("id"), in.Expiry)
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "subscriptionUntil": iso})
}

func (h *Handler) delete(c *gin.Context) {
	if unavailable(c, h.svc) {
		return
	}
	if err := h.svc.Delete(c.Request.Context(), c.Param("id")); err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}
