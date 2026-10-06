package middleware

import (
	"net/http"
	"strings"

	gojwt "github.com/274lab/server/pkg/jwt"
	"github.com/gin-gonic/gin"
)

type AuthUser struct {
	ID   string
	Role string
}

func userKey() string { return "authUser" }

// RequireAuth verifies the Bearer JWT and stores AuthUser in context.
func RequireAuth(secret string) gin.HandlerFunc {
	return func(c *gin.Context) {
		h := c.GetHeader("Authorization")
		tok := strings.TrimPrefix(h, "Bearer ")
		if h == "" || tok == h {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"ok": false, "error": "missing bearer token"})
			return
		}
		claims, err := gojwt.Verify(secret, tok)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"ok": false, "error": "invalid or expired token"})
			return
		}
		c.Set(userKey(), AuthUser{ID: claims.Sub, Role: claims.Role})
		c.Next()
	}
}

// RequireRole aborts unless the authenticated role is allowed.
func RequireRole(roles ...string) gin.HandlerFunc {
	allowed := map[string]bool{}
	for _, r := range roles {
		allowed[r] = true
	}
	return func(c *gin.Context) {
		u, ok := c.Get(userKey())
		if !ok || !allowed[u.(AuthUser).Role] {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"ok": false, "error": "forbidden"})
			return
		}
		c.Next()
	}
}

// Current returns the authenticated user (call after RequireAuth).
func Current(c *gin.Context) AuthUser {
	if u, ok := c.Get(userKey()); ok {
		return u.(AuthUser)
	}
	return AuthUser{}
}
