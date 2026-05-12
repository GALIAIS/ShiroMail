package middleware

import (
	"context"
	"strings"

	"github.com/gin-gonic/gin"
	"shiro-email/backend/internal/modules/auth"
	"shiro-email/backend/internal/modules/portal"
	"shiro-email/backend/internal/shared/apierror"
	"shiro-email/backend/internal/shared/security"
)

const authAPIKeyContextKey = "auth.apiKey"

type APIKeyAuthenticator interface {
	AuthenticateAPIKey(ctx context.Context, presented string) (portal.APIKey, error)
}

type UserRoleLookup interface {
	FindUserByID(ctx context.Context, id uint64) (auth.User, error)
}

func RequireAuth(secret string) gin.HandlerFunc {
	return func(ctx *gin.Context) {
		tokenString := bearerToken(ctx)
		if tokenString == "" {
			apierror.AbortChain(ctx, apierror.ErrUnauthorized)
			return
		}
		claims, err := security.ParseAccessToken(tokenString, secret)
		if err != nil {
			apierror.AbortChain(ctx, apierror.ErrUnauthorized)
			return
		}
		setJWTAuthContext(ctx, claims.UserID, claims.Roles)
		ctx.Next()
	}
}

func RequireUserOrAPIKey(secret string, authenticator APIKeyAuthenticator, users UserRoleLookup) gin.HandlerFunc {
	return func(ctx *gin.Context) {
		tokenString := bearerToken(ctx)
		if tokenString == "" {
			apierror.AbortChain(ctx, apierror.ErrUnauthorized)
			return
		}

		if claims, err := security.ParseAccessToken(tokenString, secret); err == nil {
			if users != nil {
				if user, userErr := users.FindUserByID(ctx.Request.Context(), claims.UserID); userErr == nil {
					if user.Status == "banned" || user.Status == "disabled" {
						apierror.AbortChain(ctx, apierror.ErrAccountSuspended)
						return
					}
				}
			}
			setJWTAuthContext(ctx, claims.UserID, claims.Roles)
			ctx.Next()
			return
		}

		if authenticator == nil {
			apierror.AbortChain(ctx, apierror.ErrUnauthorized)
			return
		}

		apiKey, err := authenticator.AuthenticateAPIKey(ctx.Request.Context(), tokenString)
		if err != nil {
			apierror.AbortChain(ctx, apierror.ErrUnauthorized)
			return
		}

		roles := []string{"api_key"}
		if users != nil {
			if user, userErr := users.FindUserByID(ctx.Request.Context(), apiKey.UserID); userErr == nil && len(user.Roles) != 0 {
				if user.Status == "banned" || user.Status == "disabled" {
					apierror.AbortChain(ctx, apierror.ErrAccountSuspended)
					return
				}
				roles = append([]string{}, user.Roles...)
				apiKey.Roles = append([]string{}, user.Roles...)
			}
		}

		ctx.Set("auth.userID", apiKey.UserID)
		ctx.Set("auth.roles", roles)
		ctx.Set("auth.authType", "api_key")
		ctx.Set(authAPIKeyContextKey, apiKey)
		ctx.Next()
	}
}

func RequireAPIScope(scope string) gin.HandlerFunc {
	return func(ctx *gin.Context) {
		apiKey, ok := CurrentAPIKey(ctx)
		if !ok {
			ctx.Next()
			return
		}
		if !portal.APIKeyHasScope(apiKey, scope) {
			apierror.AbortChain(ctx, apierror.ErrForbidden)
			return
		}
		ctx.Next()
	}
}

func CurrentAPIKey(ctx *gin.Context) (portal.APIKey, bool) {
	value, exists := ctx.Get(authAPIKeyContextKey)
	if !exists {
		return portal.APIKey{}, false
	}
	item, ok := value.(portal.APIKey)
	return item, ok
}

func bearerToken(ctx *gin.Context) string {
	header := strings.TrimSpace(ctx.GetHeader("Authorization"))
	if header != "" && strings.HasPrefix(header, "Bearer ") {
		return strings.TrimSpace(strings.TrimPrefix(header, "Bearer "))
	}
	if qToken := strings.TrimSpace(ctx.Query("token")); qToken != "" {
		return qToken
	}
	return ""
}

func setJWTAuthContext(ctx *gin.Context, userID uint64, roles []string) {
	ctx.Set("auth.userID", userID)
	ctx.Set("auth.roles", roles)
	ctx.Set("auth.authType", "jwt")
}

func RequireActiveUser(users UserRoleLookup) gin.HandlerFunc {
	return func(ctx *gin.Context) {
		uid, exists := ctx.Get("auth.userID")
		if !exists {
			ctx.Next()
			return
		}
		userID, ok := uid.(uint64)
		if !ok {
			ctx.Next()
			return
		}
		user, err := users.FindUserByID(ctx.Request.Context(), userID)
		if err != nil {
			apierror.AbortChain(ctx, apierror.ErrUnauthorized)
			return
		}
		if user.Status == "banned" || user.Status == "disabled" {
			apierror.AbortChain(ctx, apierror.ErrAccountSuspended)
			return
		}
		ctx.Next()
	}
}
