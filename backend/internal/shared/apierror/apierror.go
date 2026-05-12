package apierror

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

type Error struct {
	Code       string `json:"code"`
	Message    string `json:"message"`
	HTTPStatus int    `json:"-"`
}

func (e *Error) Error() string {
	return e.Message
}

func New(code, message string, httpStatus int) *Error {
	return &Error{Code: code, Message: message, HTTPStatus: httpStatus}
}

func WithMessage(e *Error, message string) *Error {
	return &Error{Code: e.Code, Message: message, HTTPStatus: e.HTTPStatus}
}

func Response(e *Error) gin.H {
	return gin.H{
		"code":    e.Code,
		"message": e.Message,
	}
}

func Abort(ctx *gin.Context, e *Error) {
	ctx.JSON(e.HTTPStatus, gin.H{
		"code":    e.Code,
		"message": e.Message,
	})
}

func AbortChain(ctx *gin.Context, e *Error) {
	ctx.AbortWithStatusJSON(e.HTTPStatus, gin.H{
		"code":    e.Code,
		"message": e.Message,
	})
}

func AbortWithMessage(ctx *gin.Context, e *Error, message string) {
	ctx.JSON(e.HTTPStatus, gin.H{
		"code":    e.Code,
		"message": message,
	})
}

func InternalError(message string) *Error {
	return &Error{Code: "INTERNAL_001", Message: message, HTTPStatus: http.StatusInternalServerError}
}
