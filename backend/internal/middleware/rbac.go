package middleware

import (
	"github.com/gin-gonic/gin"
	"shiro-email/backend/internal/shared/apierror"
)

func RequireRoles(allowed ...string) gin.HandlerFunc {
	return func(ctx *gin.Context) {
		value, exists := ctx.Get("auth.roles")
		if !exists {
			apierror.AbortChain(ctx, apierror.ErrForbidden)
			return
		}
		roles, ok := value.([]string)
		if !ok {
			apierror.AbortChain(ctx, apierror.ErrForbidden)
			return
		}
		for _, role := range roles {
			for _, allow := range allowed {
				if role == allow {
					ctx.Next()
					return
				}
			}
		}
		apierror.AbortChain(ctx, apierror.ErrForbidden)
	}
}
