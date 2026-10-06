package auth

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
	h := &Handler{svc: NewService(pool, secret)}
	g := r.Group("/api/auth")
	g.POST("/register", h.register)
	g.POST("/login", h.login)
	g.POST("/teacher/register", h.registerTeacher)
	g.POST("/teacher/login", h.loginTeacher)
	g.GET("/me", middleware.RequireAuth(secret), h.me)
	g.POST("/change-password", middleware.RequireAuth(secret), h.changePassword)
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
	case errors.Is(err, ErrTaken) || errors.Is(err, ErrPhoneTaken) || errors.Is(err, ErrEmailTaken):
		c.JSON(http.StatusConflict, gin.H{"ok": false, "error": err.Error()})
	case errors.Is(err, ErrBadLogin):
		c.JSON(http.StatusUnauthorized, gin.H{"ok": false, "error": err.Error()})
	case errors.Is(err, ErrShortName) || errors.Is(err, ErrWeakPassword) ||
		errors.Is(err, ErrBadEmail) || errors.Is(err, ErrBadPhone) || errors.Is(err, ErrBadPioneer):
		c.JSON(http.StatusBadRequest, gin.H{"ok": false, "error": err.Error()})
	default:
		c.JSON(http.StatusInternalServerError, gin.H{"ok": false, "error": "internal error"})
	}
}

func (h *Handler) register(c *gin.Context) {
	if unavailable(c, h.svc) {
		return
	}
	var in struct {
		Name         string   `json:"name"`
		Nickname     string   `json:"nickname"`
		Year         string   `json:"year"`
		Password     string   `json:"password"`
		Email        string   `json:"email"`
		Phone        string   `json:"phone"`
		ParentPhone  string   `json:"parentPhone"`
		TeacherPhone string   `json:"teacherPhone"`
		Subjects     []string `json:"subjects"`
		ReferredBy   string   `json:"referredBy"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"ok": false, "error": "invalid body"})
		return
	}
	st, tok, err := h.svc.Register(c.Request.Context(), RegisterInput(in))
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusCreated, gin.H{"ok": true, "token": tok, "student": st})
}

func (h *Handler) login(c *gin.Context) {
	if unavailable(c, h.svc) {
		return
	}
	var in struct {
		Name     string `json:"name"`
		Password string `json:"password"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"ok": false, "error": "invalid body"})
		return
	}
	st, tok, err := h.svc.Login(c.Request.Context(), in.Name, in.Password)
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "token": tok, "student": st})
}

func (h *Handler) me(c *gin.Context) {
	if unavailable(c, h.svc) {
		return
	}
	u := middleware.Current(c)
	st, err := h.svc.getStudent(c.Request.Context(), u.ID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"ok": false, "error": "not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "student": st})
}

func (h *Handler) changePassword(c *gin.Context) {
	if unavailable(c, h.svc) {
		return
	}
	var in struct {
		CurrentPassword string `json:"currentPassword"`
		NewPassword     string `json:"newPassword"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"ok": false, "error": "invalid body"})
		return
	}
	u := middleware.Current(c)
	if u.Role == "teacher" {
		c.JSON(http.StatusBadRequest, gin.H{"ok": false, "error": "teachers use dashboard reset"})
		return
	}
	if err := h.svc.ChangePassword(c.Request.Context(), u.ID, in.CurrentPassword, in.NewPassword); err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *Handler) registerTeacher(c *gin.Context) {
	if unavailable(c, h.svc) {
		return
	}
	var in struct {
		Name        string `json:"name"`
		Email       string `json:"email"`
		Phone       string `json:"phone"`
		Password    string `json:"password"`
		PioneerCode string `json:"pioneerCode"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"ok": false, "error": "invalid body"})
		return
	}
	t, tok, err := h.svc.RegisterTeacher(c.Request.Context(), TeacherRegisterInput(in))
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusCreated, gin.H{"ok": true, "token": tok, "teacher": t})
}

func (h *Handler) loginTeacher(c *gin.Context) {
	if unavailable(c, h.svc) {
		return
	}
	var in struct {
		Phone    string `json:"phone"`
		Password string `json:"password"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"ok": false, "error": "invalid body"})
		return
	}
	t, tok, err := h.svc.LoginTeacher(c.Request.Context(), in.Phone, in.Password)
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "token": tok, "teacher": t})
}
