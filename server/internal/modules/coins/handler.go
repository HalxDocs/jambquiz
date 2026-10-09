package coins

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
	r.GET("/api/coins/balance", auth, h.balance)
	r.POST("/api/coins/share", auth, h.share)
	r.GET("/api/coins/packs", h.packs)
	r.POST("/api/coins/squad", auth, h.squad)
	r.POST("/api/coins/lifeline", auth, h.lifeline)
	r.POST("/api/coins/peek-status", auth, h.peekStatus)
	r.GET("/api/goats", h.listGoats)
	r.GET("/api/goats/week", h.weekGoats)
	r.POST("/api/admin/goats", auth, middleware.RequireRole("admin"), h.createGoat)
	r.PUT("/api/admin/goats/:id", auth, middleware.RequireRole("admin"), h.updateGoat)
	r.DELETE("/api/admin/goats/:id", auth, middleware.RequireRole("admin"), h.deleteGoat)
	r.PUT("/api/admin/goats/week", auth, middleware.RequireRole("admin"), h.setWeekGoats)
	r.POST("/api/admin/coin-packs", auth, middleware.RequireRole("admin"), h.upsertPack)
}

func unavailable(c *gin.Context, svc *Service) bool {
	if svc.pool == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"ok": false, "error": "database unavailable"})
		return true
	}
	return false
}

func ownerOrAdmin(c *gin.Context, studentID string) bool {
	u := middleware.Current(c)
	if u.Role == "admin" || u.ID == studentID {
		return true
	}
	c.JSON(http.StatusForbidden, gin.H{"ok": false, "error": "forbidden"})
	return false
}

func fail(c *gin.Context, err error) {
	switch {
	case errors.Is(err, ErrNotFound):
		c.JSON(http.StatusNotFound, gin.H{"ok": false, "error": err.Error()})
	case errors.Is(err, ErrBadInput) || errors.Is(err, ErrNoCoins):
		c.JSON(http.StatusBadRequest, gin.H{"ok": false, "error": err.Error()})
	case errors.Is(err, ErrRateLimited):
		c.JSON(http.StatusTooManyRequests, gin.H{"ok": false, "error": err.Error()})
	default:
		c.JSON(http.StatusInternalServerError, gin.H{"ok": false, "error": "internal error"})
	}
}

func (h *Handler) balance(c *gin.Context) {
	if unavailable(c, h.svc) {
		return
	}
	sid := c.Query("studentId")
	if sid == "" || !ownerOrAdmin(c, sid) {
		if sid == "" {
			c.JSON(http.StatusBadRequest, gin.H{"ok": false, "error": "invalid body"})
		}
		return
	}
	coins, refNo, err := h.svc.Balance(c.Request.Context(), sid)
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "coins": coins, "referralNo": refNo})
}

func (h *Handler) share(c *gin.Context) {
	if unavailable(c, h.svc) {
		return
	}
	var in struct {
		StudentID string `json:"studentId"`
		Week      string `json:"week"`
		ScoreID   string `json:"scoreId"`
	}
	if err := c.ShouldBindJSON(&in); err != nil || in.StudentID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"ok": false, "error": "invalid body"})
		return
	}
	if !ownerOrAdmin(c, in.StudentID) {
		return
	}
	coins, dup, err := h.svc.ShareResult(c.Request.Context(), in.StudentID, in.Week, in.ScoreID)
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "coins": coins, "alreadyShared": dup})
}

func (h *Handler) packs(c *gin.Context) {
	if unavailable(c, h.svc) {
		return
	}
	packs, err := h.svc.ListPacks(c.Request.Context())
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "packs": packs})
}

func (h *Handler) upsertPack(c *gin.Context) {
	if unavailable(c, h.svc) {
		return
	}
	var in struct {
		ID       string `json:"id"`
		Coins    int    `json:"coins"`
		PriceNGN int    `json:"priceNgn"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"ok": false, "error": "invalid body"})
		return
	}
	id, err := h.svc.UpsertPack(c.Request.Context(), in.ID, in.Coins, in.PriceNGN)
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "id": id})
}

func (h *Handler) squad(c *gin.Context) {
	if unavailable(c, h.svc) {
		return
	}
	var in struct {
		StudentID string   `json:"studentId"`
		Squad     []string `json:"squad"`
	}
	if err := c.ShouldBindJSON(&in); err != nil || in.StudentID == "" || in.Squad == nil {
		c.JSON(http.StatusBadRequest, gin.H{"ok": false, "error": "invalid body"})
		return
	}
	if !ownerOrAdmin(c, in.StudentID) {
		return
	}
	squad, err := h.svc.UpdateSquad(c.Request.Context(), in.StudentID, in.Squad)
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "squad": squad})
}

func (h *Handler) lifeline(c *gin.Context) {
	if unavailable(c, h.svc) {
		return
	}
	var in struct {
		StudentID string `json:"studentId"`
		SessionID string `json:"sessionId"`
		Subject   string `json:"subject"`
		QIndex    *int   `json:"qIndex"`
		Kind      string `json:"kind"`
		GoatID    string `json:"goatId"`
		FriendID  string `json:"friendId"`
	}
	if err := c.ShouldBindJSON(&in); err != nil || in.StudentID == "" || in.SessionID == "" || in.QIndex == nil {
		c.JSON(http.StatusBadRequest, gin.H{"ok": false, "error": "invalid body"})
		return
	}
	u := middleware.Current(c)
	res, err := h.svc.UseLifeline(c.Request.Context(), u.ID, in.StudentID, in.SessionID, in.Subject, *in.QIndex, in.Kind, in.GoatID, in.FriendID)
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "cached": res.Cached, "coins": res.Coins, "cost": res.Cost,
		"eliminate": res.Eliminate, "shown": res.Shown, "goatId": res.GoatID, "goatName": res.GoatName,
		"stars": res.Stars, "explanation": res.Explanation, "explanationImage": res.ExplanationImage,
		"friendId": res.FriendID, "friendName": res.FriendName, "optionText": res.OptionText})
}

func (h *Handler) peekStatus(c *gin.Context) {
	if unavailable(c, h.svc) {
		return
	}
	var in struct {
		StudentID string   `json:"studentId"`
		SessionID string   `json:"sessionId"`
		Subject   string   `json:"subject"`
		QIndex    *int     `json:"qIndex"`
		FriendIDs []string `json:"friendIds"`
	}
	if err := c.ShouldBindJSON(&in); err != nil || in.StudentID == "" || in.SessionID == "" || in.QIndex == nil {
		c.JSON(http.StatusBadRequest, gin.H{"ok": false, "error": "invalid body"})
		return
	}
	u := middleware.Current(c)
	st, err := h.svc.PeekStatus(c.Request.Context(), u.ID, in.StudentID, in.SessionID, in.Subject, *in.QIndex, in.FriendIDs)
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "statuses": st})
}

func (h *Handler) listGoats(c *gin.Context) {
	if unavailable(c, h.svc) {
		return
	}
	goats, err := h.svc.ListGoats(c.Request.Context())
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "goats": goats})
}

func (h *Handler) createGoat(c *gin.Context) {
	if unavailable(c, h.svc) {
		return
	}
	var g Goat
	if err := c.ShouldBindJSON(&g); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"ok": false, "error": "invalid body"})
		return
	}
	id, err := h.svc.CreateGoat(c.Request.Context(), g)
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusCreated, gin.H{"ok": true, "id": id})
}

func (h *Handler) updateGoat(c *gin.Context) {
	if unavailable(c, h.svc) {
		return
	}
	var g Goat
	if err := c.ShouldBindJSON(&g); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"ok": false, "error": "invalid body"})
		return
	}
	if err := h.svc.UpdateGoat(c.Request.Context(), c.Param("id"), g); err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *Handler) deleteGoat(c *gin.Context) {
	if unavailable(c, h.svc) {
		return
	}
	if err := h.svc.DeleteGoat(c.Request.Context(), c.Param("id")); err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *Handler) weekGoats(c *gin.Context) {
	if unavailable(c, h.svc) {
		return
	}
	ids, err := h.svc.WeekGoats(c.Request.Context(), c.Query("week"))
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "goatIds": ids})
}

func (h *Handler) setWeekGoats(c *gin.Context) {
	if unavailable(c, h.svc) {
		return
	}
	var in struct {
		Week    string   `json:"week"`
		GoatIDs []string `json:"goatIds"`
	}
	if err := c.ShouldBindJSON(&in); err != nil || in.Week == "" {
		c.JSON(http.StatusBadRequest, gin.H{"ok": false, "error": "invalid body"})
		return
	}
	if err := h.svc.SetWeekGoats(c.Request.Context(), in.Week, in.GoatIDs); err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}
