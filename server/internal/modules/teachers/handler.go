package teachers

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

func RegisterRoutes(r *gin.Engine, pool *pgxpool.Pool, secret, paystackSecret string) {
	h := &Handler{svc: NewService(pool, paystackSecret)}
	auth := middleware.RequireAuth(secret)
	teacherOnly := middleware.RequireRole("teacher")
	admin := middleware.RequireRole("admin")

	r.GET("/api/teacher/dashboard", auth, teacherOnly, h.dashboard)
	r.PATCH("/api/teacher/details", auth, teacherOnly, h.details)
	r.PATCH("/api/teacher/phone", auth, teacherOnly, h.phone)
	r.GET("/api/teacher/pioneer", auth, teacherOnly, h.pioneer)

	r.GET("/api/admin/teachers", auth, admin, h.adminOverview)
	r.POST("/api/admin/teachers/pioneer", auth, admin, h.makePioneer)
	r.DELETE("/api/admin/teachers/pioneer", auth, admin, h.removePioneer)
	r.DELETE("/api/admin/teachers/:id", auth, admin, h.deleteTeacher)
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
	case errors.Is(err, ErrBadInput) || errors.Is(err, ErrTaken):
		c.JSON(http.StatusBadRequest, gin.H{"ok": false, "error": err.Error()})
	case errors.Is(err, ErrRateLimited):
		c.JSON(http.StatusTooManyRequests, gin.H{"ok": false, "error": err.Error()})
	case errors.Is(err, ErrNotConfigured):
		c.JSON(http.StatusFailedDependency, gin.H{"ok": false, "error": err.Error()})
	default:
		c.JSON(http.StatusInternalServerError, gin.H{"ok": false, "error": "internal error"})
	}
}

func (h *Handler) dashboard(c *gin.Context) {
	if unavailable(c, h.svc) {
		return
	}
	u := middleware.Current(c)
	d, err := h.svc.Dashboard(c.Request.Context(), u.ID)
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "linkedCount": d.LinkedCount, "teacher": d.Teacher,
		"monthsEarnings": d.MonthsEarnings, "qualifiedCounts": d.QualifiedCounts,
		"pioneerEarnings": d.PioneerEarnings, "pioneerQualifiedCounts": d.PioneerQualifiedCounts,
		"students": d.Students})
}

func (h *Handler) details(c *gin.Context) {
	if unavailable(c, h.svc) {
		return
	}
	var in struct {
		AccountNumber string `json:"accountNumber"`
		BankName      string `json:"bankName"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"ok": false, "error": "invalid body"})
		return
	}
	u := middleware.Current(c)
	res, err := h.svc.UpdateDetails(c.Request.Context(), u.ID, in.AccountNumber, in.BankName)
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "accountNumber": res["accountNumber"],
		"bankName": res["bankName"], "accountName": res["accountName"], "bankVerified": true})
}

func (h *Handler) phone(c *gin.Context) {
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
	u := middleware.Current(c)
	phone, migrated, err := h.svc.UpdatePhone(c.Request.Context(), u.ID, in.Phone)
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "phone": phone, "migrated": migrated})
}

func (h *Handler) pioneer(c *gin.Context) {
	if unavailable(c, h.svc) {
		return
	}
	u := middleware.Current(c)
	ref, err := h.svc.PioneerDashboard(c.Request.Context(), u.ID)
	if err != nil {
		if errors.Is(err, ErrForbidden) {
			c.JSON(http.StatusForbidden, gin.H{"ok": false, "error": "not a pioneer"})
			return
		}
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "referred": ref})
}

func (h *Handler) adminOverview(c *gin.Context) {
	if unavailable(c, h.svc) {
		return
	}
	out, err := h.svc.AdminOverview(c.Request.Context())
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "count": out.Count, "latestMonth": out.LatestMonth,
		"months": out.Months, "teachers": out.Teachers})
}

func (h *Handler) makePioneer(c *gin.Context) {
	if unavailable(c, h.svc) {
		return
	}
	var in struct {
		TeacherID string `json:"teacherId"`
	}
	if err := c.ShouldBindJSON(&in); err != nil || in.TeacherID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"ok": false, "error": "invalid body"})
		return
	}
	code, err := h.svc.MakePioneer(c.Request.Context(), in.TeacherID)
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "code": code})
}

func (h *Handler) removePioneer(c *gin.Context) {
	if unavailable(c, h.svc) {
		return
	}
	var in struct {
		TeacherID string `json:"teacherId"`
	}
	if err := c.ShouldBindJSON(&in); err != nil || in.TeacherID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"ok": false, "error": "invalid body"})
		return
	}
	if err := h.svc.RemovePioneer(c.Request.Context(), in.TeacherID); err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *Handler) deleteTeacher(c *gin.Context) {
	if unavailable(c, h.svc) {
		return
	}
	if err := h.svc.DeleteTeacher(c.Request.Context(), c.Param("id")); err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}
