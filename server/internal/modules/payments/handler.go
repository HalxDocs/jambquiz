package payments

import (
	"errors"
	"fmt"
	"io"
	"net/http"

	"github.com/274lab/server/internal/middleware"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Handler struct {
	svc *Service
}

func RegisterRoutes(r *gin.Engine, pool *pgxpool.Pool, secret string, cfg Config) {
	h := &Handler{svc: NewService(pool, cfg)}
	auth := middleware.RequireAuth(secret)
	r.POST("/api/payments/paystack/create", auth, h.createPaystack)
	r.POST("/api/payments/paystack/complete", auth, h.completePaystack)
	r.POST("/api/payments/bachs/create", auth, h.createBachs)
	r.POST("/api/payments/bachs/complete", auth, h.completeBachs)
	r.POST("/api/webhooks/paystack", h.paystackWebhook)
	r.POST("/api/webhooks/bachs", h.bachsWebhook)
	r.GET("/api/admin/payments/sync", middleware.RequireAuth(secret), middleware.RequireRole("admin"), h.syncPaystack)
	r.GET("/api/payments", middleware.RequireAuth(secret), h.listMine)
	r.GET("/api/admin/payments", middleware.RequireAuth(secret), middleware.RequireRole("admin"), h.adminList)
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
	case errors.Is(err, ErrBadInput) || errors.Is(err, ErrNotSuccess) ||
		errors.Is(err, ErrUnderpaid) || errors.Is(err, ErrBadCurrency):
		c.JSON(http.StatusBadRequest, gin.H{"ok": false, "error": err.Error()})
	case errors.Is(err, ErrRateLimited):
		c.JSON(http.StatusTooManyRequests, gin.H{"ok": false, "error": err.Error()})
	case errors.Is(err, ErrNotConfigured):
		c.JSON(http.StatusFailedDependency, gin.H{"ok": false, "error": err.Error()})
	default:
		c.JSON(http.StatusInternalServerError, gin.H{"ok": false, "error": "internal error"})
	}
}

func (h *Handler) createPaystack(c *gin.Context) {
	if unavailable(c, h.svc) {
		return
	}
	var in struct {
		StudentID   string `json:"studentId"`
		Type        string `json:"type"`
		PackID      string `json:"packId"`
		CallbackURL string `json:"callbackUrl"`
	}
	if err := c.ShouldBindJSON(&in); err != nil || in.StudentID == "" || in.Type == "" {
		c.JSON(http.StatusBadRequest, gin.H{"ok": false, "error": "invalid body"})
		return
	}
	if !ownerOrAdmin(c, in.StudentID) {
		return
	}
	init, err := h.svc.CreatePaystack(c.Request.Context(), in.StudentID, in.Type, in.PackID, in.CallbackURL)
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "authorization_url": init.AuthorizationURL,
		"access_code": init.AccessCode, "reference": init.Reference})
}

func (h *Handler) completePaystack(c *gin.Context) {
	if unavailable(c, h.svc) {
		return
	}
	var in struct {
		Reference string `json:"reference"`
	}
	if err := c.ShouldBindJSON(&in); err != nil || in.Reference == "" {
		c.JSON(http.StatusBadRequest, gin.H{"ok": false, "error": "invalid body"})
		return
	}
	// Ownership first: only the checkout's student (or admin) may fulfill it.
	studentID, err := h.svc.CheckoutStudent(c.Request.Context(), in.Reference)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"ok": false, "error": "not found"})
		return
	}
	if !ownerOrAdmin(c, studentID) {
		return
	}
	res, err := h.svc.CompletePaystack(c.Request.Context(), in.Reference)
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "alreadyFulfilled": res.AlreadyFulfilled, "payment": res.Payment})
}

func (h *Handler) createBachs(c *gin.Context) {
	if unavailable(c, h.svc) {
		return
	}
	var in struct {
		StudentID  string `json:"studentId"`
		Type       string `json:"type"`
		SuccessURL string `json:"successUrl"`
		CancelURL  string `json:"cancelUrl"`
	}
	if err := c.ShouldBindJSON(&in); err != nil || in.StudentID == "" || in.Type == "" {
		c.JSON(http.StatusBadRequest, gin.H{"ok": false, "error": "invalid body"})
		return
	}
	if !ownerOrAdmin(c, in.StudentID) {
		return
	}
	init, err := h.svc.CreateBachs(c.Request.Context(), in.StudentID, in.Type, in.SuccessURL, in.CancelURL)
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "checkout_url": init.CheckoutURL, "checkout_id": init.CheckoutID})
}

func (h *Handler) completeBachs(c *gin.Context) {
	if unavailable(c, h.svc) {
		return
	}
	var in struct {
		CheckoutID string `json:"checkoutId"`
	}
	if err := c.ShouldBindJSON(&in); err != nil || in.CheckoutID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"ok": false, "error": "invalid body"})
		return
	}
	// Ownership check before fulfilling.
	var studentID string
	if err := h.svc.pool.QueryRow(c.Request.Context(),
		`SELECT student_id FROM bachs_checkouts WHERE id=$1`, in.CheckoutID).Scan(&studentID); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"ok": false, "error": "not found"})
		return
	}
	if !ownerOrAdmin(c, studentID) {
		return
	}
	if err := h.svc.CompleteBachs(c.Request.Context(), in.CheckoutID); err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *Handler) paystackWebhook(c *gin.Context) {
	if unavailable(c, h.svc) {
		return
	}
	raw, err := io.ReadAll(c.Request.Body)
	if err != nil {
		c.String(http.StatusBadRequest, "bad body")
		return
	}
	if err := h.svc.PaystackWebhook(c.Request.Context(), raw, c.GetHeader("x-paystack-signature")); err != nil {
		if errors.Is(err, ErrUnauthorized) || errors.Is(err, ErrNotConfigured) {
			c.String(http.StatusUnauthorized, "unauthorized")
			return
		}
		c.String(http.StatusInternalServerError, "error")
		return
	}
	c.String(http.StatusOK, "ok")
}

func (h *Handler) bachsWebhook(c *gin.Context) {
	if unavailable(c, h.svc) {
		return
	}
	raw, err := io.ReadAll(c.Request.Body)
	if err != nil {
		c.String(http.StatusBadRequest, "bad body")
		return
	}
	token := c.Query("token")
	if token == "" {
		token = c.GetHeader("x-bachs-token")
	}
	if err := h.svc.BachsWebhook(c.Request.Context(), token,
		c.GetHeader("x-bachs-timestamp"), c.GetHeader("x-bachs-signature"), raw); err != nil {
		if errors.Is(err, ErrUnauthorized) {
			c.String(http.StatusUnauthorized, "unauthorized")
			return
		}
		c.String(http.StatusInternalServerError, "error")
		return
	}
	c.String(http.StatusOK, "ok")
}

func (h *Handler) syncPaystack(c *gin.Context) {
	if unavailable(c, h.svc) {
		return
	}
	synced, skipped, failed, err := h.svc.SyncPaystack(c.Request.Context())
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "synced": synced, "skipped": skipped, "failed": failed})
}

func (h *Handler) listMine(c *gin.Context) {
	if unavailable(c, h.svc) {
		return
	}
	u := middleware.Current(c)
	sid := c.Query("studentId")
	if sid == "" {
		if u.Role == "admin" {
			c.JSON(http.StatusBadRequest, gin.H{"ok": false, "error": "invalid body"})
			return
		}
		sid = u.ID
	} else if u.Role != "admin" && sid != u.ID {
		c.JSON(http.StatusForbidden, gin.H{"ok": false, "error": "forbidden"})
		return
	}
	payments, err := h.svc.ListPayments(c.Request.Context(), sid)
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "payments": payments})
}

func (h *Handler) adminList(c *gin.Context) {
	if unavailable(c, h.svc) {
		return
	}
	page, pageSize := 1, 20
	if v := c.Query("page"); v != "" {
		fmt.Sscanf(v, "%d", &page)
	}
	if v := c.Query("pageSize"); v != "" {
		fmt.Sscanf(v, "%d", &pageSize)
	}
	payments, total, err := h.svc.AdminPayments(c.Request.Context(), c.Query("search"), page, pageSize)
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "payments": payments, "total": total, "page": page})
}
