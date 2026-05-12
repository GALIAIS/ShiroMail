package auth

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	"shiro-email/backend/internal/shared/apierror"
)

type Controller struct {
	service *Service
}

func NewController(service *Service) *Controller {
	return &Controller{service: service}
}

func (c *Controller) Register(ctx *gin.Context) {
	var req RegisterRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		apierror.Abort(ctx, apierror.ErrInvalidRequest)
		return
	}
	result, err := c.service.Register(ctx, req)
	if err != nil {
		var pending *PendingVerificationError
		if errors.As(err, &pending) {
			ctx.JSON(http.StatusAccepted, pending.Challenge)
			return
		}
		apierror.AbortWithMessage(ctx, apierror.ErrRegistrationConflict, err.Error())
		return
	}
	ctx.JSON(http.StatusCreated, result)
}

func (c *Controller) Settings(ctx *gin.Context) {
	result, err := c.service.Settings(ctx)
	if err != nil {
		apierror.Abort(ctx, apierror.InternalError("failed to load auth settings"))
		return
	}
	ctx.JSON(http.StatusOK, result)
}

func (c *Controller) Login(ctx *gin.Context) {
	var req LoginRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		apierror.Abort(ctx, apierror.ErrInvalidRequest)
		return
	}
	result, err := c.service.Login(ctx, req)
	if err != nil {
		var pending *PendingVerificationError
		if errors.As(err, &pending) {
			ctx.JSON(http.StatusForbidden, pending.Challenge)
			return
		}
		var pendingMFA *PendingMFAError
		if errors.As(err, &pendingMFA) {
			ctx.JSON(http.StatusForbidden, pendingMFA.Challenge)
			return
		}
		apierror.Abort(ctx, apierror.ErrInvalidCredentials)
		return
	}
	ctx.JSON(http.StatusOK, result)
}

func (c *Controller) Refresh(ctx *gin.Context) {
	var req RefreshRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		apierror.Abort(ctx, apierror.ErrInvalidRequest)
		return
	}
	result, err := c.service.Refresh(ctx, req.RefreshToken)
	if err != nil {
		apierror.Abort(ctx, apierror.ErrInvalidRefreshToken)
		return
	}
	ctx.JSON(http.StatusOK, result)
}

func (c *Controller) Logout(ctx *gin.Context) {
	var req LogoutRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		apierror.Abort(ctx, apierror.ErrInvalidRequest)
		return
	}
	if err := c.service.Logout(ctx, req.RefreshToken); err != nil {
		apierror.Abort(ctx, apierror.ErrInvalidRefreshToken)
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"status": "ok"})
}

func (c *Controller) ForgotPassword(ctx *gin.Context) {
	var req ForgotPasswordRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		apierror.Abort(ctx, apierror.ErrInvalidRequest)
		return
	}
	result, err := c.service.ForgotPassword(ctx, req)
	if err != nil {
		apierror.Abort(ctx, apierror.ErrForgotPasswordFailed)
		return
	}
	ctx.JSON(http.StatusOK, result)
}

func (c *Controller) ResetPassword(ctx *gin.Context) {
	var req ResetPasswordRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		apierror.Abort(ctx, apierror.ErrInvalidRequest)
		return
	}
	result, err := c.service.ResetPassword(ctx, req)
	if err != nil {
		apierror.AbortWithMessage(ctx, apierror.ErrResetPasswordFailed, err.Error())
		return
	}
	ctx.JSON(http.StatusOK, result)
}

func (c *Controller) StartOAuth(ctx *gin.Context) {
	provider := ctx.Param("provider")
	result, err := c.service.StartOAuth(ctx, provider)
	if err != nil {
		apierror.AbortWithMessage(ctx, apierror.ErrInvalidRequest, err.Error())
		return
	}
	ctx.JSON(http.StatusOK, result)
}

func (c *Controller) CompleteOAuth(ctx *gin.Context) {
	provider := ctx.Param("provider")
	var req OAuthCallbackRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		apierror.Abort(ctx, apierror.ErrInvalidRequest)
		return
	}
	result, err := c.service.CompleteOAuth(ctx, provider, req)
	if err != nil {
		var pending *PendingVerificationError
		if errors.As(err, &pending) {
			ctx.JSON(http.StatusAccepted, pending.Challenge)
			return
		}
		apierror.AbortWithMessage(ctx, apierror.ErrOAuthFailed, err.Error())
		return
	}
	ctx.JSON(http.StatusOK, result)
}

func (c *Controller) ConfirmEmailVerification(ctx *gin.Context) {
	var req EmailVerificationConfirmRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		apierror.Abort(ctx, apierror.ErrInvalidRequest)
		return
	}
	result, err := c.service.ConfirmEmailVerification(ctx, req)
	if err != nil {
		apierror.AbortWithMessage(ctx, apierror.ErrEmailVerificationRequired, err.Error())
		return
	}
	ctx.JSON(http.StatusOK, result)
}

func (c *Controller) ResendEmailVerification(ctx *gin.Context) {
	var req EmailVerificationResendRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		apierror.Abort(ctx, apierror.ErrInvalidRequest)
		return
	}
	result, err := c.service.ResendEmailVerification(ctx, req)
	if err != nil {
		apierror.AbortWithMessage(ctx, apierror.ErrEmailVerificationRequired, err.Error())
		return
	}
	ctx.JSON(http.StatusOK, result)
}

func (c *Controller) GetAccountProfile(ctx *gin.Context) {
	userID, ok := authUserID(ctx)
	if !ok {
		apierror.Abort(ctx, apierror.ErrUnauthorized)
		return
	}
	result, err := c.service.GetAccountProfile(ctx, userID)
	if err != nil {
		apierror.Abort(ctx, apierror.ErrAccountProfileFailed)
		return
	}
	ctx.JSON(http.StatusOK, result)
}

func (c *Controller) UpdateAccountProfile(ctx *gin.Context) {
	userID, ok := authUserID(ctx)
	if !ok {
		apierror.Abort(ctx, apierror.ErrUnauthorized)
		return
	}
	var req UpdateAccountProfileRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		apierror.Abort(ctx, apierror.ErrInvalidRequest)
		return
	}
	result, err := c.service.UpdateAccountProfile(ctx, userID, req)
	if err != nil {
		apierror.Abort(ctx, apierror.ErrAccountUpdateFailed)
		return
	}
	ctx.JSON(http.StatusOK, result)
}

func (c *Controller) RequestEmailChange(ctx *gin.Context) {
	userID, ok := authUserID(ctx)
	if !ok {
		apierror.Abort(ctx, apierror.ErrUnauthorized)
		return
	}
	var req RequestEmailChangeRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		apierror.Abort(ctx, apierror.ErrInvalidRequest)
		return
	}
	result, err := c.service.RequestEmailChange(ctx, userID, req)
	if err != nil {
		apierror.AbortWithMessage(ctx, apierror.ErrEmailChangeFailed, err.Error())
		return
	}
	ctx.JSON(http.StatusOK, result)
}

func (c *Controller) ConfirmEmailChange(ctx *gin.Context) {
	userID, ok := authUserID(ctx)
	if !ok {
		apierror.Abort(ctx, apierror.ErrUnauthorized)
		return
	}
	var req ConfirmEmailChangeRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		apierror.Abort(ctx, apierror.ErrInvalidRequest)
		return
	}
	result, err := c.service.ConfirmEmailChange(ctx, userID, req)
	if err != nil {
		apierror.AbortWithMessage(ctx, apierror.ErrEmailChangeFailed, err.Error())
		return
	}
	ctx.JSON(http.StatusOK, result)
}

func (c *Controller) ChangePassword(ctx *gin.Context) {
	userID, ok := authUserID(ctx)
	if !ok {
		apierror.Abort(ctx, apierror.ErrUnauthorized)
		return
	}
	var req ChangePasswordRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		apierror.Abort(ctx, apierror.ErrInvalidRequest)
		return
	}
	if err := c.service.ChangePassword(ctx, userID, req); err != nil {
		apierror.AbortWithMessage(ctx, apierror.ErrPasswordChangeFailed, err.Error())
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"status": "ok"})
}

func (c *Controller) GetTOTPStatus(ctx *gin.Context) {
	userID, ok := authUserID(ctx)
	if !ok {
		apierror.Abort(ctx, apierror.ErrUnauthorized)
		return
	}
	result, err := c.service.GetTOTPStatus(ctx, userID)
	if err != nil {
		apierror.Abort(ctx, apierror.ErrTOTPSetupFailed)
		return
	}
	ctx.JSON(http.StatusOK, result)
}

func (c *Controller) SetupTOTP(ctx *gin.Context) {
	userID, ok := authUserID(ctx)
	if !ok {
		apierror.Abort(ctx, apierror.ErrUnauthorized)
		return
	}
	result, err := c.service.SetupTOTP(ctx, userID)
	if err != nil {
		apierror.Abort(ctx, apierror.ErrTOTPSetupFailed)
		return
	}
	ctx.JSON(http.StatusOK, result)
}

func (c *Controller) EnableTOTP(ctx *gin.Context) {
	userID, ok := authUserID(ctx)
	if !ok {
		apierror.Abort(ctx, apierror.ErrUnauthorized)
		return
	}
	var req EnableTOTPRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		apierror.Abort(ctx, apierror.ErrInvalidRequest)
		return
	}
	if err := c.service.EnableTOTP(ctx, userID, req); err != nil {
		apierror.AbortWithMessage(ctx, apierror.ErrTOTPVerifyFailed, err.Error())
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"status": "ok"})
}

func (c *Controller) DisableTOTP(ctx *gin.Context) {
	userID, ok := authUserID(ctx)
	if !ok {
		apierror.Abort(ctx, apierror.ErrUnauthorized)
		return
	}
	var req DisableTOTPRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		apierror.Abort(ctx, apierror.ErrInvalidRequest)
		return
	}
	if err := c.service.DisableTOTP(ctx, userID, req); err != nil {
		apierror.AbortWithMessage(ctx, apierror.ErrTOTPVerifyFailed, err.Error())
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"status": "ok"})
}

func (c *Controller) VerifyLoginTOTP(ctx *gin.Context) {
	var req VerifyLoginTOTPRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		apierror.Abort(ctx, apierror.ErrInvalidRequest)
		return
	}
	result, err := c.service.VerifyLoginTOTP(ctx, req)
	if err != nil {
		apierror.AbortWithMessage(ctx, apierror.ErrTOTPVerifyFailed, err.Error())
		return
	}
	ctx.JSON(http.StatusOK, result)
}

func authUserID(ctx *gin.Context) (uint64, bool) {
	value, ok := ctx.Get("auth.userID")
	if !ok {
		return 0, false
	}
	userID, ok := value.(uint64)
	return userID, ok
}
