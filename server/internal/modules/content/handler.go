package content

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
	admin := middleware.RequireRole("admin")

	r.GET("/api/questions", h.list)
	r.GET("/api/admin/questions", auth, admin, h.listAnswers)
	r.POST("/api/admin/questions", auth, admin, h.create)
	r.PUT("/api/admin/questions/:id", auth, admin, h.update)
	r.DELETE("/api/admin/questions/:id", auth, admin, h.remove)
	r.POST("/api/admin/questions/copy", auth, admin, h.copy)

	r.GET("/api/limits", h.getLimit)
	r.PUT("/api/admin/limits", auth, admin, h.saveLimit)

	r.GET("/api/topics/:week", h.getTopics)
	r.PUT("/api/admin/topics/:week", auth, admin, h.saveTopics)

	r.GET("/api/settings/active-week", h.activeWeek)
	r.PUT("/api/admin/settings/active-week", auth, admin, h.setActiveWeek)
	r.GET("/api/settings/quiz-dates", h.quizDates)
	r.PUT("/api/admin/settings/quiz-dates", auth, admin, h.setQuizDates)
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
	case errors.Is(err, ErrBadInput):
		c.JSON(http.StatusBadRequest, gin.H{"ok": false, "error": err.Error()})
	default:
		c.JSON(http.StatusInternalServerError, gin.H{"ok": false, "error": "internal error"})
	}
}

func (h *Handler) list(c *gin.Context) {
	if unavailable(c, h.svc) {
		return
	}
	q, err := h.svc.List(c.Request.Context(), c.Query("subject"), c.Query("week"))
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "questions": q})
}

func (h *Handler) listAnswers(c *gin.Context) {
	if unavailable(c, h.svc) {
		return
	}
	q, err := h.svc.ListWithAnswers(c.Request.Context(), c.Query("subject"), c.Query("week"))
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "questions": q})
}

func (h *Handler) create(c *gin.Context) {
	if unavailable(c, h.svc) {
		return
	}
	var in QuestionInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"ok": false, "error": "invalid body"})
		return
	}
	id, err := h.svc.Create(c.Request.Context(), in)
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusCreated, gin.H{"ok": true, "id": id})
}

func (h *Handler) update(c *gin.Context) {
	if unavailable(c, h.svc) {
		return
	}
	var in QuestionInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"ok": false, "error": "invalid body"})
		return
	}
	if err := h.svc.Update(c.Request.Context(), c.Param("id"), in); err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *Handler) remove(c *gin.Context) {
	if unavailable(c, h.svc) {
		return
	}
	if err := h.svc.Delete(c.Request.Context(), c.Param("id")); err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *Handler) copy(c *gin.Context) {
	if unavailable(c, h.svc) {
		return
	}
	var in struct {
		Subject  string `json:"subject"`
		FromWeek string `json:"fromWeek"`
		ToWeek   string `json:"toWeek"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"ok": false, "error": "invalid body"})
		return
	}
	n, err := h.svc.Copy(c.Request.Context(), in.Subject, in.FromWeek, in.ToWeek)
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "copied": n})
}

func (h *Handler) getLimit(c *gin.Context) {
	if unavailable(c, h.svc) {
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true,
		"limit": h.svc.GetLimit(c.Request.Context(), c.Query("subject"), c.Query("week"))})
}

func (h *Handler) saveLimit(c *gin.Context) {
	if unavailable(c, h.svc) {
		return
	}
	var in struct {
		Subject string `json:"subject"`
		Week    string `json:"week"`
		Limit   int    `json:"limit"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"ok": false, "error": "invalid body"})
		return
	}
	if err := h.svc.SaveLimit(c.Request.Context(), in.Subject, in.Week, in.Limit); err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *Handler) getTopics(c *gin.Context) {
	if unavailable(c, h.svc) {
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "topics": h.svc.GetTopics(c.Request.Context(), c.Param("week"))})
}

func (h *Handler) saveTopics(c *gin.Context) {
	if unavailable(c, h.svc) {
		return
	}
	var in struct {
		Topics map[string]any `json:"topics"`
	}
	if err := c.ShouldBindJSON(&in); err != nil || in.Topics == nil {
		c.JSON(http.StatusBadRequest, gin.H{"ok": false, "error": "invalid body"})
		return
	}
	if err := h.svc.SaveTopics(c.Request.Context(), c.Param("week"), in.Topics); err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *Handler) activeWeek(c *gin.Context) {
	if unavailable(c, h.svc) {
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "week": h.svc.ActiveWeek(c.Request.Context())})
}

func (h *Handler) setActiveWeek(c *gin.Context) {
	if unavailable(c, h.svc) {
		return
	}
	var in struct {
		Week   string `json:"week"`
		Source string `json:"source"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"ok": false, "error": "invalid body"})
		return
	}
	if err := h.svc.SetActiveWeek(c.Request.Context(), in.Week, in.Source); err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *Handler) quizDates(c *gin.Context) {
	if unavailable(c, h.svc) {
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true,
		"dates": h.svc.GetSetting(c.Request.Context(), "quizDates_"+sanitizeKey(c.Query("week")))})
}

func (h *Handler) setQuizDates(c *gin.Context) {
	if unavailable(c, h.svc) {
		return
	}
	var in struct {
		Week  string `json:"week"`
		Date1 string `json:"date1"`
		Date2 string `json:"date2"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"ok": false, "error": "invalid body"})
		return
	}
	if err := h.svc.SetQuizDates(c.Request.Context(), in.Week, in.Date1, in.Date2); err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}
