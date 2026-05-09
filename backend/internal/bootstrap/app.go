package bootstrap

import (
	"context"
	"errors"
	"fmt"
	"log"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/go-redis/redis/v8"
	"gorm.io/gorm"

	"shiro-email/backend/internal/config"
	"shiro-email/backend/internal/database"
	"shiro-email/backend/internal/jobs"
	"shiro-email/backend/internal/middleware"
	"shiro-email/backend/internal/modules/admin"
	"shiro-email/backend/internal/modules/auth"
	"shiro-email/backend/internal/modules/domain"
	domainprovider "shiro-email/backend/internal/modules/domain/provider"
	"shiro-email/backend/internal/modules/extractor"
	"shiro-email/backend/internal/modules/ingest"
	ingestsmtp "shiro-email/backend/internal/modules/ingest/smtp"
	"shiro-email/backend/internal/modules/mailbox"
	"shiro-email/backend/internal/modules/message"
	"shiro-email/backend/internal/modules/portal"
	"shiro-email/backend/internal/modules/rule"
	"shiro-email/backend/internal/modules/system"
	"shiro-email/backend/internal/realtime"
	sharedcache "shiro-email/backend/internal/shared/cache"
	"shiro-email/backend/internal/shared/logger"
	"shiro-email/backend/internal/shared/security"
	"shiro-email/backend/internal/webhook"
)

type AppState struct {
	AuthRepo      auth.Repository
	DomainRepo    domain.Repository
	MailboxRepo   mailbox.Repository
	MessageRepo   message.Repository
	RuleRepo      rule.Repository
	ExtractorRepo extractor.Repository
	PortalRepo    portal.Repository
	ConfigRepo    system.ConfigRepository
	JobRepo       system.JobRepository
	AuditRepo     system.AuditRepository
	Cache         *sharedcache.JSONCache
	MailStorage   ingest.FileStorage
	DirectIngest  *ingest.DirectService
	RedisClient   *redis.Client
	WSHub         *realtime.Hub
	DB            *gorm.DB
	WebhookDispatcher *webhook.Dispatcher
}

func MustRunHTTPServer() {
	cfg := config.MustLoadConfig()
	logger.Init(cfg.AppEnv)

	if cfg.IsProduction() {
		weak := map[string]bool{"dev-secret": true, "change-me-in-production": true, "secret": true, "": true}
		if weak[cfg.JWTSecret] || len(cfg.JWTSecret) < 32 {
			log.Fatal("FATAL: JWT_SECRET must be at least 32 characters and not a default value in production.")
		}
	}
	state, err := newRuntimePersistentState(cfg)
	if err != nil {
		log.Fatalf("bootstrap runtime app: %v", err)
	}
	engine := buildRouter(cfg, state)

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	httpAddr := ":" + cfg.AppPort
	httpServer := &http.Server{
		Addr:         httpAddr,
		Handler:      engine,
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 30 * time.Second,
	}

	errCh := make(chan error, 2)
	go func() {
		slog.Info("api http listening", "addr", httpAddr)
		if err := httpServer.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			errCh <- fmt.Errorf("http server failed: %w", err)
		}
	}()

	var smtpServer *ingestsmtp.Server
	if state.DirectIngest != nil {
		smtpEnabled, smtpRuntimeConfig := resolveSMTPRuntimeSettings(context.Background(), state.ConfigRepo)
		if smtpEnabled {
			smtpServer = ingestsmtp.NewServer(smtpRuntimeConfig, state.DirectIngest)
			go func() {
				defer func() {
					if recovered := recover(); recovered != nil {
						errCh <- fmt.Errorf("smtp server failed: %v", recovered)
					}
				}()
				smtpServer.Start(ctx, func() {
					slog.Info("api smtp listening", "addr", smtpServer.Addr())
				})
			}()
		}
	}

	var fatalErr error
	select {
	case <-ctx.Done():
	case fatalErr = <-errCh:
		stop()
	}

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := httpServer.Shutdown(shutdownCtx); err != nil && !errors.Is(err, http.ErrServerClosed) {
		slog.Error("http shutdown error", "error", err)
	}
	if smtpServer != nil {
		smtpServer.Drain()
	}

	if fatalErr != nil {
		log.Fatalf("%v", fatalErr)
	}
}

func resolveSMTPRuntimeSettings(ctx context.Context, repo system.ConfigRepository) (bool, ingestsmtp.Config) {
	stored, err := system.LoadMailSMTPSettings(ctx, repo)
	if err != nil {
		slog.Warn("smtp runtime config fallback to defaults", "error", err)
		stored = system.MailSMTPConfig{
			Enabled:         true,
			ListenAddr:      ":2525",
			Hostname:        "mail.shiro.local",
			MaxMessageBytes: 10 * 1024 * 1024,
		}
	}

	listenAddr := strings.TrimSpace(stored.ListenAddr)
	if listenAddr == "" {
		listenAddr = ":2525"
	}
	hostname := strings.TrimSpace(stored.Hostname)
	if hostname == "" {
		hostname = "mail.shiro.local"
	}
	maxMessageBytes := stored.MaxMessageBytes
	if maxMessageBytes <= 0 {
		maxMessageBytes = 10 * 1024 * 1024
	}

	return stored.Enabled, ingestsmtp.Config{
		ListenAddr:      listenAddr,
		Hostname:        hostname,
		MaxMessageBytes: maxMessageBytes,
	}
}

func resolveAPILimitsRuntimeSettings(ctx context.Context, repo system.ConfigRepository) system.APILimitsConfig {
	stored, err := system.LoadAPILimitsSettings(ctx, repo)
	if err != nil {
		slog.Warn("api rate limit config fallback to defaults", "error", err)
		stored = system.APILimitsConfig{
			Enabled:                     true,
			IdentityMode:                "bearer_or_ip",
			AnonymousRPM:                120,
			AuthenticatedRPM:            600,
			AuthRPM:                     10,
			LoginRPM:                    10,
			RegisterRPM:                 10,
			RefreshRPM:                  30,
			ForgotPasswordRPM:           10,
			ResetPasswordRPM:            10,
			EmailVerificationResendRPM:  10,
			EmailVerificationConfirmRPM: 30,
			OAuthStartRPM:               20,
			OAuthCallbackRPM:            20,
			Login2FAVerifyRPM:           20,
			MailboxWriteRPM:             1200,
			StrictIPEnabled:             false,
			StrictIPRPM:                 1800,
		}
	}
	return stored
}

func NewRouterForTest() http.Handler {
	handler, _ := NewTestApp()
	return handler
}

func NewTestApp() (http.Handler, *AppState) {
	cfg := config.MustLoadConfig()
	state := newMemoryAppState()
	return buildRouter(cfg, state), state
}

func NewRuntimeAppForTest(cfg config.Config) (*gin.Engine, error) {
	state, err := newRuntimePersistentState(cfg)
	if err != nil {
		return nil, err
	}
	return buildRouter(cfg, state), nil
}

func buildRouter(cfg config.Config, state *AppState) *gin.Engine {
	if state.WSHub == nil {
		state.WSHub = realtime.NewHub(cfg.CORSAllowedOrigins...)
	}

	engine := gin.New()
	engine.Use(gin.Recovery(), middleware.RequestID(), middleware.MetricsMiddleware(), middleware.AllowBrowserClients(cfg.CORSAllowedOrigins...), middleware.AccessLog())
	engine.GET("/healthz", func(ctx *gin.Context) {
		checks := gin.H{}
		healthy := true

		if state.RedisClient != nil {
			if err := state.RedisClient.Ping(ctx.Request.Context()).Err(); err != nil {
				checks["redis"] = "down"
				healthy = false
			} else {
				checks["redis"] = "ok"
			}
		}

		status := http.StatusOK
		if !healthy {
			status = http.StatusServiceUnavailable
		}
		checks["status"] = map[bool]string{true: "ok", false: "degraded"}[healthy]
		ctx.JSON(status, checks)
	})
	engine.GET("/ws", middleware.RequireAuth(cfg.JWTSecret), state.WSHub.HandleWS)
	engine.GET("/metrics", middleware.MetricsHandler(cfg.MetricsToken))

	authService := auth.NewService(state.AuthRepo, cfg.JWTSecret, state.ConfigRepo)
	authController := auth.NewController(authService)
	providerRegistry := domainprovider.NewRegistry(cfg.CloudflareAPIBaseURL, cfg.SpaceshipAPIBaseURL)
	domainService := domain.NewService(state.DomainRepo, func(ctx context.Context, domainID uint64) (bool, error) {
		items, err := state.MailboxRepo.ListActive(ctx)
		if err != nil {
			return false, err
		}
		for _, item := range items {
			if item.DomainID == domainID {
				return true, nil
			}
		}
		return false, nil
	}, func(ctx context.Context, domainID uint64) error {
		_, err := state.MailboxRepo.DeleteInactiveByDomainID(ctx, domainID)
		return err
	}, state.ConfigRepo, state.AuditRepo, providerRegistry, state.Cache)
	domainController := domain.NewController(domainService)
	mailboxService := mailbox.NewService(state.MailboxRepo, state.DomainRepo, state.MessageRepo, state.Cache)
	mailboxController := mailbox.NewController(mailboxService)
	messageService := message.NewService(state.MessageRepo, state.MailboxRepo, state.DomainRepo, state.MailStorage, state.Cache)
	messageController := message.NewController(messageService, state.DirectIngest)
	portalService := portal.NewService(state.PortalRepo, state.AuthRepo)
	var webhookTester portal.WebhookTester
	if state.WebhookDispatcher != nil {
		webhookTester = &webhookTesterAdapter{dispatcher: state.WebhookDispatcher}
	}
	portalController := portal.NewController(portalService, webhookTester)
	adminService := admin.NewService(state.AuthRepo, state.DomainRepo, domainService, state.MailboxRepo, state.MessageRepo, messageService, state.PortalRepo, state.JobRepo, state.AuditRepo, state.Cache)
	adminController := admin.NewController(adminService)
	ruleService := rule.NewService(state.RuleRepo, state.AuditRepo)
	ruleController := rule.NewController(ruleService)
	extractorService := extractor.NewService(state.ExtractorRepo, state.MailboxRepo, messageService, state.AuditRepo)
	extractorController := extractor.NewController(extractorService)
	var spoolList any
	var spoolRetry any
	var smtpMetrics any
	if state.DirectIngest != nil {
		spoolList = system.InboundSpoolListFunc(func(ctx context.Context) ([]system.InboundSpoolRecord, error) {
			items, err := state.DirectIngest.ListSpool(ctx)
			if err != nil {
				return nil, err
			}
			records := make([]system.InboundSpoolRecord, 0, len(items))
			for _, item := range items {
				records = append(records, system.InboundSpoolRecord{
					ID:               item.ID,
					MailFrom:         item.MailFrom,
					Recipients:       append([]string{}, item.Recipients...),
					TargetMailboxIDs: append([]uint64{}, item.TargetMailboxIDs...),
					Status:           item.Status,
					ErrorMessage:     item.ErrorMessage,
					AttemptCount:     item.AttemptCount,
					MaxAttempts:      item.MaxAttempts,
					CreatedAt:        item.CreatedAt,
					UpdatedAt:        item.UpdatedAt,
					NextAttemptAt:    item.NextAttemptAt,
					ProcessedAt:      item.ProcessedAt,
				})
			}
			return records, nil
		})
		spoolRetry = system.InboundSpoolRetryFunc(func(ctx context.Context, id uint64) (system.InboundSpoolRecord, error) {
			item, err := state.DirectIngest.RetrySpoolItem(ctx, id)
			if err != nil {
				if errors.Is(err, ingest.ErrSpoolItemNotFound) {
					return system.InboundSpoolRecord{}, system.ErrInboundSpoolItemNotFound
				}
				return system.InboundSpoolRecord{}, err
			}
			return system.InboundSpoolRecord{
				ID:               item.ID,
				MailFrom:         item.MailFrom,
				Recipients:       append([]string{}, item.Recipients...),
				TargetMailboxIDs: append([]uint64{}, item.TargetMailboxIDs...),
				Status:           item.Status,
				ErrorMessage:     item.ErrorMessage,
				AttemptCount:     item.AttemptCount,
				MaxAttempts:      item.MaxAttempts,
				CreatedAt:        item.CreatedAt,
				UpdatedAt:        item.UpdatedAt,
				NextAttemptAt:    item.NextAttemptAt,
				ProcessedAt:      item.ProcessedAt,
			}, nil
		})
	}
	smtpMetrics = system.SMTPMetricsSnapshotFunc(func(context.Context) (system.SMTPMetricsSnapshot, error) {
		snapshot := middleware.SnapshotSMTPMetrics()
		return system.SMTPMetricsSnapshot{
			SessionsStarted:    snapshot.SessionsStarted,
			RecipientsAccepted: snapshot.RecipientsAccepted,
			BytesReceived:      snapshot.BytesReceived,
			Accepted:           snapshot.Accepted,
			Rejected:           snapshot.Rejected,
			SpoolProcessed:     snapshot.SpoolProcessed,
		}, nil
	})
	var (
		cachedStats     system.PublicSiteStats
		cachedStatsAt   time.Time
		cachedStatsMu   sync.Mutex
	)
	publicStatsProvider := system.PublicSiteStatsFunc(func(ctx context.Context) (system.PublicSiteStats, error) {
		cachedStatsMu.Lock()
		defer cachedStatsMu.Unlock()
		if time.Since(cachedStatsAt) < 30*time.Second {
			return cachedStats, nil
		}
		users, err := state.AuthRepo.ListUsers(ctx)
		if err != nil {
			return system.PublicSiteStats{}, err
		}
		cachedStats = system.PublicSiteStats{
			ActiveMailboxCount: state.MailboxRepo.CountActive(ctx),
			TodayMessageCount:  state.MessageRepo.CountToday(ctx),
			ActiveDomainCount:  state.DomainRepo.CountActive(ctx),
			TotalUserCount:     len(users),
			FailedJobCount:     state.JobRepo.CountFailed(ctx),
			UpdatedAt:          time.Now().UTC(),
		}
		cachedStatsAt = time.Now()
		return cachedStats, nil
	})
	var appStartedAt = time.Now()
	systemMonitoringProvider := system.SystemMonitoringFunc(func(ctx context.Context) (system.SystemMonitoringSnapshot, error) {
		snapshot := system.SystemMonitoringSnapshot{}

		smtpSnap := middleware.SnapshotSMTPMetrics()
		snapshot.SMTP = system.SystemMonitoringSMTP{
			SessionsStarted:    smtpSnap.SessionsStarted,
			RecipientsAccepted: smtpSnap.RecipientsAccepted,
			BytesReceived:      smtpSnap.BytesReceived,
		}
		if state.DirectIngest != nil {
			spoolItems, err := state.DirectIngest.ListSpool(ctx)
			if err == nil {
				pending := 0
				for _, item := range spoolItems {
					if item.Status == "pending" || item.Status == "processing" {
						pending++
					}
				}
				snapshot.SMTP.QueueDepth = pending
			}
		}

		if state.RedisClient != nil {
			info, err := state.RedisClient.Info(ctx, "memory", "clients", "server").Result()
			if err == nil {
				snapshot.Redis.Connected = true
				snapshot.Redis.UsedMemoryBytes = parseRedisInfoInt64(info, "used_memory")
				snapshot.Redis.UsedMemoryHuman = parseRedisInfoString(info, "used_memory_human")
				snapshot.Redis.ConnectedClients = parseRedisInfoInt64(info, "connected_clients")
				snapshot.Redis.UptimeSeconds = parseRedisInfoInt64(info, "uptime_in_seconds")
			}
		}

		if state.DB != nil {
			sqlDB, err := state.DB.DB()
			if err == nil {
				dbStats := sqlDB.Stats()
				snapshot.Database = system.SystemMonitoringDatabase{
					OpenConnections: dbStats.OpenConnections,
					InUse:           dbStats.InUse,
					Idle:            dbStats.Idle,
					MaxOpen:         dbStats.MaxOpenConnections,
				}
			}
		}

		snapshot.General = system.SystemMonitoringGeneral{
			UptimeSeconds:      int64(time.Since(appStartedAt).Seconds()),
			TotalMessagesCount: state.MessageRepo.CountToday(ctx),
			ActiveMailboxCount: state.MailboxRepo.CountActive(ctx),
			StartedAt:          appStartedAt,
		}

		return snapshot, nil
	})
	systemService := system.NewService(state.ConfigRepo, state.JobRepo, state.AuditRepo, spoolList, spoolRetry, smtpMetrics, publicStatsProvider, systemMonitoringProvider)
	systemController := system.NewController(systemService)
	authGuard := middleware.RequireAuth(cfg.JWTSecret)
	apiKeyGuard := middleware.RequireUserOrAPIKey(cfg.JWTSecret, state.PortalRepo, state.AuthRepo)
	adminGuard := []gin.HandlerFunc{apiKeyGuard, middleware.RequireRoles("admin")}

	var authRL, loginRL, registerRL, refreshRL, forgotPasswordRL, resetPasswordRL, emailVerificationResendRL, emailVerificationConfirmRL, oauthStartRL, oauthCallbackRL, login2FAVerifyRL, generalRL, mailboxWriteRL, strictIPRL gin.HandlerFunc
	if state.RedisClient != nil {
		rl := middleware.NewRateLimiter(state.RedisClient)
		apiLimitsCache := newAPILimitsRuntimeCache(state.ConfigRepo)

		authRL = rl.LimitDynamic("auth", time.Minute, func(ctx *gin.Context) int {
			current := apiLimitsCache.Current(ctx.Request.Context())
			if !current.Enabled {
				return 0
			}
			return current.AuthRPM
		}, middleware.RequestIPRateLimitKey)
		loginRL = rl.LimitDynamic("auth-login", time.Minute, func(ctx *gin.Context) int {
			current := apiLimitsCache.Current(ctx.Request.Context())
			if !current.Enabled {
				return 0
			}
			return current.LoginRPM
		}, middleware.RequestIPRateLimitKey)
		registerRL = rl.LimitDynamic("auth-register", time.Minute, func(ctx *gin.Context) int {
			current := apiLimitsCache.Current(ctx.Request.Context())
			if !current.Enabled {
				return 0
			}
			return current.RegisterRPM
		}, middleware.RequestIPRateLimitKey)
		refreshRL = rl.LimitDynamic("auth-refresh", time.Minute, func(ctx *gin.Context) int {
			current := apiLimitsCache.Current(ctx.Request.Context())
			if !current.Enabled {
				return 0
			}
			return current.RefreshRPM
		}, middleware.RequestIPRateLimitKey)
		forgotPasswordRL = rl.LimitDynamic("auth-forgot-password", time.Minute, func(ctx *gin.Context) int {
			current := apiLimitsCache.Current(ctx.Request.Context())
			if !current.Enabled {
				return 0
			}
			return current.ForgotPasswordRPM
		}, middleware.RequestIPRateLimitKey)
		resetPasswordRL = rl.LimitDynamic("auth-reset-password", time.Minute, func(ctx *gin.Context) int {
			current := apiLimitsCache.Current(ctx.Request.Context())
			if !current.Enabled {
				return 0
			}
			return current.ResetPasswordRPM
		}, middleware.RequestIPRateLimitKey)
		emailVerificationResendRL = rl.LimitDynamic("auth-email-verification-resend", time.Minute, func(ctx *gin.Context) int {
			current := apiLimitsCache.Current(ctx.Request.Context())
			if !current.Enabled {
				return 0
			}
			return current.EmailVerificationResendRPM
		}, middleware.RequestIPRateLimitKey)
		emailVerificationConfirmRL = rl.LimitDynamic("auth-email-verification-confirm", time.Minute, func(ctx *gin.Context) int {
			current := apiLimitsCache.Current(ctx.Request.Context())
			if !current.Enabled {
				return 0
			}
			return current.EmailVerificationConfirmRPM
		}, middleware.RequestIPRateLimitKey)
		oauthStartRL = rl.LimitDynamic("auth-oauth-start", time.Minute, func(ctx *gin.Context) int {
			current := apiLimitsCache.Current(ctx.Request.Context())
			if !current.Enabled {
				return 0
			}
			return current.OAuthStartRPM
		}, middleware.RequestIPRateLimitKey)
		oauthCallbackRL = rl.LimitDynamic("auth-oauth-callback", time.Minute, func(ctx *gin.Context) int {
			current := apiLimitsCache.Current(ctx.Request.Context())
			if !current.Enabled {
				return 0
			}
			return current.OAuthCallbackRPM
		}, middleware.RequestIPRateLimitKey)
		login2FAVerifyRL = rl.LimitDynamic("auth-login-2fa-verify", time.Minute, func(ctx *gin.Context) int {
			current := apiLimitsCache.Current(ctx.Request.Context())
			if !current.Enabled {
				return 0
			}
			return current.Login2FAVerifyRPM
		}, middleware.RequestIPRateLimitKey)
		generalRL = rl.LimitDynamic("api", time.Minute, func(ctx *gin.Context) int {
			current := apiLimitsCache.Current(ctx.Request.Context())
			if !current.Enabled {
				return 0
			}
			if middleware.RequestHasBearerCredential(ctx) {
				return current.AuthenticatedRPM
			}
			return current.AnonymousRPM
		}, func(ctx *gin.Context) string {
			current := apiLimitsCache.Current(ctx.Request.Context())
			return middleware.RequestRateLimitKeyWithMode(current.IdentityMode)(ctx)
		})
		mailboxWriteRL = rl.LimitDynamic("mailboxes-write", time.Minute, func(ctx *gin.Context) int {
			current := apiLimitsCache.Current(ctx.Request.Context())
			if !current.Enabled {
				return 0
			}
			return current.MailboxWriteRPM
		}, func(ctx *gin.Context) string {
			current := apiLimitsCache.Current(ctx.Request.Context())
			return middleware.RequestRateLimitKeyWithMode(current.IdentityMode)(ctx)
		})
		strictIPRL = rl.LimitDynamic("api-strict-ip", time.Minute, func(ctx *gin.Context) int {
			current := apiLimitsCache.Current(ctx.Request.Context())
			if !current.Enabled || !current.StrictIPEnabled {
				return 0
			}
			return current.StrictIPRPM
		}, middleware.RequestIPRateLimitKey)
	} else {
		noop := func(ctx *gin.Context) { ctx.Next() }
		authRL = noop
		loginRL = noop
		registerRL = noop
		refreshRL = noop
		forgotPasswordRL = noop
		resetPasswordRL = noop
		emailVerificationResendRL = noop
		emailVerificationConfirmRL = noop
		oauthStartRL = noop
		oauthCallbackRL = noop
		login2FAVerifyRL = noop
		generalRL = noop
		mailboxWriteRL = noop
		strictIPRL = noop
	}
	if authRL == nil {
		noop := func(ctx *gin.Context) { ctx.Next() }
		authRL = noop
		loginRL = noop
		registerRL = noop
		refreshRL = noop
		forgotPasswordRL = noop
		resetPasswordRL = noop
		emailVerificationResendRL = noop
		emailVerificationConfirmRL = noop
		oauthStartRL = noop
		oauthCallbackRL = noop
		login2FAVerifyRL = noop
		generalRL = noop
		mailboxWriteRL = noop
		strictIPRL = noop
	}

	api := engine.Group("/api/v1")
	api.Use(generalRL, strictIPRL)
	api.POST("/auth/register", authRL, registerRL, authController.Register)
	api.POST("/auth/login", authRL, loginRL, authController.Login)
	api.GET("/auth/settings", authController.Settings)
	api.GET("/site/settings", systemController.PublicSiteSettings)
	api.GET("/site/stats", systemController.PublicSiteStats)
	api.POST("/auth/forgot-password", authRL, forgotPasswordRL, authController.ForgotPassword)
	api.POST("/auth/reset-password", authRL, resetPasswordRL, authController.ResetPassword)
	api.POST("/auth/email-verification/confirm", emailVerificationConfirmRL, authController.ConfirmEmailVerification)
	api.POST("/auth/email-verification/resend", emailVerificationResendRL, authController.ResendEmailVerification)
	api.POST("/auth/oauth/:provider/start", oauthStartRL, authController.StartOAuth)
	api.POST("/auth/oauth/:provider/callback", oauthCallbackRL, authController.CompleteOAuth)
	api.POST("/auth/login/2fa/verify", authRL, login2FAVerifyRL, authController.VerifyLoginTOTP)
	api.POST("/auth/refresh", refreshRL, authController.Refresh)
	api.POST("/auth/logout", authGuard, authController.Logout)
	api.GET("/account/profile", authGuard, authController.GetAccountProfile)
	api.PATCH("/account/profile", authGuard, authController.UpdateAccountProfile)
	api.POST("/account/email/change/request", authGuard, authController.RequestEmailChange)
	api.POST("/account/email/change/confirm", authGuard, authController.ConfirmEmailChange)
	api.POST("/account/password/change", authGuard, authController.ChangePassword)
	api.GET("/account/2fa/status", authGuard, authController.GetTOTPStatus)
	api.POST("/account/2fa/totp/setup", authGuard, authController.SetupTOTP)
	api.POST("/account/2fa/totp/enable", authGuard, authController.EnableTOTP)
	api.POST("/account/2fa/totp/disable", authGuard, authController.DisableTOTP)
	api.GET("/domains", apiKeyGuard, middleware.RequireAPIScope("domains.read"), domainController.List)
	api.POST("/domains", apiKeyGuard, middleware.RequireAPIScope("domains.write"), domainController.Create)
	api.PUT("/domains/:id/provider-binding", authGuard, domainController.UpdateOwnedProviderBinding)
	api.POST("/domains/:id/verify", authGuard, domainController.VerifyOwnedDomain)
	api.DELETE("/domains/:id", authGuard, domainController.Delete)
	api.POST("/domains/generate", apiKeyGuard, middleware.RequireAPIScope("domains.write"), domainController.Generate)
	api.POST("/domains/:id/public-pool", apiKeyGuard, middleware.RequireAPIScope("domains.publish"), domainController.RequestPublicPoolPublication)
	api.POST("/domains/:id/public-pool/withdraw", apiKeyGuard, middleware.RequireAPIScope("domains.unpublish"), domainController.WithdrawPublicPoolPublication)
	api.GET("/dashboard", apiKeyGuard, middleware.RequireAPIScope("mailboxes.read"), middleware.RequireAPIScope("domains.read"), mailboxController.Dashboard)
	api.GET("/dashboard/trend", authGuard, messageController.Trend)
	api.GET("/dashboard/activity", authGuard, messageController.RecentActivity)
	api.GET("/dashboard/search", authGuard, messageController.GlobalSearch)
	api.GET("/mailboxes", apiKeyGuard, middleware.RequireAPIScope("mailboxes.read"), mailboxController.List)
	api.POST("/mailboxes", mailboxWriteRL, apiKeyGuard, middleware.RequireAPIScope("mailboxes.write"), mailboxController.Create)
	api.POST("/mailboxes/:mailboxId/extend", mailboxWriteRL, apiKeyGuard, middleware.RequireAPIScope("mailboxes.write"), mailboxController.Extend)
	api.POST("/mailboxes/:mailboxId/release", mailboxWriteRL, apiKeyGuard, middleware.RequireAPIScope("mailboxes.write"), mailboxController.Release)
	api.GET("/mailboxes/:mailboxId/messages", apiKeyGuard, middleware.RequireAPIScope("messages.read"), messageController.ListByMailbox)
	api.GET("/mailboxes/:mailboxId/messages/:id", apiKeyGuard, middleware.RequireAPIScope("messages.read"), messageController.Detail)
	api.GET("/mailboxes/:mailboxId/messages/:id/extractions", apiKeyGuard, middleware.RequireAPIScope("messages.read"), extractorController.ListMessageExtractions)
	api.GET("/mailboxes/:mailboxId/messages/:id/raw", apiKeyGuard, middleware.RequireAPIScope("messages.read"), messageController.Raw)
	api.GET("/mailboxes/:mailboxId/messages/:id/raw/parsed", apiKeyGuard, middleware.RequireAPIScope("messages.read"), messageController.ParsedRaw)
	api.GET("/mailboxes/:mailboxId/messages/:id/attachments/:index", apiKeyGuard, middleware.RequireAPIScope("messages.attachments.read"), messageController.Attachment)
	api.POST("/mailboxes/:mailboxId/messages/receive", apiKeyGuard, middleware.RequireAPIScope("messages.write"), messageController.Receive)
	api.POST("/messages/batch-delete", authGuard, messageController.BatchDelete)
	api.POST("/messages/batch-read", authGuard, messageController.BatchRead)
	api.GET("/portal/overview", authGuard, portalController.Overview)
	api.GET("/portal/notices", authGuard, portalController.ListNotices)
	api.GET("/portal/feedback", authGuard, portalController.ListFeedback)
	api.POST("/portal/feedback", authGuard, portalController.CreateFeedback)
	api.GET("/portal/api-keys", authGuard, portalController.ListAPIKeys)
	api.POST("/portal/api-keys", authGuard, portalController.CreateAPIKey)
	api.POST("/portal/api-keys/:id/rotate", authGuard, portalController.RotateAPIKey)
	api.POST("/portal/api-keys/:id/revoke", authGuard, portalController.RevokeAPIKey)
	api.GET("/portal/webhooks", authGuard, portalController.ListWebhooks)
	api.POST("/portal/webhooks", authGuard, portalController.CreateWebhook)
	api.PUT("/portal/webhooks/:id", authGuard, portalController.UpdateWebhook)
	api.POST("/portal/webhooks/:id/toggle", authGuard, portalController.ToggleWebhook)
	api.GET("/portal/webhooks/:id/deliveries", authGuard, portalController.ListWebhookDeliveryLogs)
	api.POST("/portal/webhooks/:id/test", authGuard, portalController.TestWebhook)
	api.GET("/portal/domain-providers", authGuard, domainController.ListOwnedProviderAccounts)
	api.POST("/portal/domain-providers", authGuard, domainController.CreateOwnedProviderAccount)
	api.PUT("/portal/domain-providers/:id", authGuard, domainController.UpdateOwnedProviderAccount)
	api.DELETE("/portal/domain-providers/:id", authGuard, domainController.DeleteOwnedProviderAccount)
	api.POST("/portal/domain-providers/:id/validate", authGuard, domainController.ValidateOwnedProviderAccount)
	api.GET("/portal/domain-providers/:id/zones", authGuard, domainController.ListOwnedProviderZones)
	api.GET("/portal/domain-providers/:id/zones/:zoneId/records", authGuard, domainController.ListOwnedProviderRecords)
	api.GET("/portal/domain-providers/:id/zones/:zoneId/change-sets", authGuard, domainController.ListOwnedProviderChangeSets)
	api.GET("/portal/domain-providers/:id/zones/:zoneId/verifications", authGuard, domainController.ListOwnedProviderVerifications)
	api.POST("/portal/domain-providers/:id/zones/:zoneId/change-sets/preview", authGuard, domainController.PreviewOwnedProviderChangeSet)
	api.POST("/portal/dns-change-sets/:changeSetId/apply", authGuard, domainController.ApplyOwnedProviderChangeSet)
	api.GET("/portal/docs", authGuard, portalController.ListDocs)
	api.GET("/portal/billing", authGuard, portalController.GetBilling)
	api.GET("/portal/balance", authGuard, portalController.GetBalance)
	api.GET("/portal/settings", authGuard, portalController.GetSettings)
	api.PUT("/portal/settings", authGuard, portalController.UpdateSettings)
	api.GET("/portal/mail-extractor-rules", authGuard, extractorController.ListPortalRules)
	api.POST("/portal/mail-extractor-rules", authGuard, extractorController.CreatePortalRule)
	api.PUT("/portal/mail-extractor-rules/:id", authGuard, extractorController.UpdatePortalRule)
	api.DELETE("/portal/mail-extractor-rules/:id", authGuard, extractorController.DeletePortalRule)
	api.POST("/portal/mail-extractor-rules/test", authGuard, extractorController.TestPortalRule)
	api.POST("/portal/mail-extractor-rules/templates/:id/enable", authGuard, extractorController.EnableTemplate)
	api.POST("/portal/mail-extractor-rules/templates/:id/disable", authGuard, extractorController.DisableTemplate)
	api.POST("/portal/mail-extractor-rules/templates/:id/copy", authGuard, extractorController.CopyTemplate)
	api.GET("/portal/mailboxes/:mailboxId/messages/:id/extractions", authGuard, extractorController.ListMessageExtractions)

	adminGroup := api.Group("/admin")
	adminGroup.Use(adminGuard...)
	adminGroup.GET("/overview", adminController.Overview)
	adminGroup.GET("/users", adminController.ListUsers)
	adminGroup.GET("/users/:id/detail", adminController.GetUserDetail)
	adminGroup.PUT("/users/:id", adminController.UpdateUser)
	adminGroup.DELETE("/users/:id", adminController.DeleteUser)
	adminGroup.PUT("/users/:id/roles", adminController.UpdateUserRoles)
	adminGroup.POST("/users/:id/ban", adminController.BanUser)
	adminGroup.POST("/users/:id/unban", adminController.UnbanUser)
	adminGroup.GET("/domains", adminController.ListDomains)
	adminGroup.POST("/domains/generate", domainController.GenerateAdmin)
	adminGroup.GET("/domain-providers", adminController.ListDomainProviders)
	adminGroup.PUT("/domain-providers/:id", adminController.UpdateDomainProvider)
	adminGroup.DELETE("/domain-providers/:id", adminController.DeleteDomainProvider)
	adminGroup.GET("/mailboxes", adminController.ListMailboxes)
	adminGroup.GET("/mailboxes/domains", adminController.ListMailboxDomains)
	adminGroup.POST("/mailboxes", mailboxWriteRL, adminController.CreateMailbox)
	adminGroup.POST("/mailboxes/:mailboxId/extend", mailboxWriteRL, adminController.ExtendMailbox)
	adminGroup.POST("/mailboxes/:mailboxId/release", mailboxWriteRL, adminController.ReleaseMailbox)
	adminGroup.GET("/mailboxes/:mailboxId/messages", adminController.ListMailboxMessages)
	adminGroup.GET("/mailboxes/:mailboxId/messages/:id", adminController.MailboxMessageDetail)
	adminGroup.GET("/mailboxes/:mailboxId/messages/:id/raw", adminController.MailboxMessageRaw)
	adminGroup.GET("/mailboxes/:mailboxId/messages/:id/raw/parsed", adminController.MailboxMessageParsedRaw)
	adminGroup.GET("/mailboxes/:mailboxId/messages/:id/attachments/:index", adminController.MailboxMessageAttachment)
	adminGroup.GET("/messages", adminController.ListMessages)
	adminGroup.GET("/api-keys", adminController.ListAPIKeys)
	adminGroup.POST("/api-keys", adminController.CreateAPIKey)
	adminGroup.POST("/api-keys/:id/rotate", adminController.RotateAPIKey)
	adminGroup.POST("/api-keys/:id/revoke", adminController.RevokeAPIKey)
	adminGroup.GET("/webhooks", adminController.ListWebhooks)
	adminGroup.POST("/webhooks", adminController.CreateWebhook)
	adminGroup.PUT("/webhooks/:id", adminController.UpdateWebhook)
	adminGroup.POST("/webhooks/:id/toggle", adminController.ToggleWebhook)
	adminGroup.GET("/notices", adminController.ListNotices)
	adminGroup.POST("/notices", adminController.CreateNotice)
	adminGroup.PUT("/notices/:id", adminController.UpdateNotice)
	adminGroup.DELETE("/notices/:id", adminController.DeleteNotice)
	adminGroup.GET("/docs", adminController.ListDocs)
	adminGroup.POST("/docs", adminController.CreateDoc)
	adminGroup.PUT("/docs/:id", adminController.UpdateDoc)
	adminGroup.DELETE("/docs/:id", adminController.DeleteDoc)
	adminGroup.POST("/domains", adminController.UpsertDomain)
	adminGroup.POST("/domains/:id/verify", adminController.VerifyDomain)
	adminGroup.DELETE("/domains/:id", adminController.DeleteDomain)
	adminGroup.POST("/domains/:id/public-pool/review", adminController.ReviewDomainPublication)
	adminGroup.POST("/domain-providers", adminController.CreateDomainProvider)
	adminGroup.POST("/domain-providers/:id/validate", adminController.ValidateDomainProvider)
	adminGroup.GET("/domain-providers/:id/zones", adminController.ListDomainProviderZones)
	adminGroup.GET("/domain-providers/:id/zones/:zoneId/records", adminController.ListDomainProviderRecords)
	adminGroup.GET("/domain-providers/:id/zones/:zoneId/change-sets", adminController.ListDomainProviderChangeSets)
	adminGroup.GET("/domain-providers/:id/zones/:zoneId/verifications", adminController.ListDomainProviderVerifications)
	adminGroup.POST("/domain-providers/:id/zones/:zoneId/change-sets/preview", adminController.PreviewDomainProviderChangeSet)
	adminGroup.POST("/dns-change-sets/:changeSetId/apply", adminController.ApplyDomainProviderChangeSet)
	adminGroup.GET("/rules", ruleController.List)
	adminGroup.PUT("/rules/:id", ruleController.Upsert)
	adminGroup.GET("/mail-extractor-rules", extractorController.ListAdminRules)
	adminGroup.POST("/mail-extractor-rules", extractorController.CreateAdminRule)
	adminGroup.PUT("/mail-extractor-rules/:id", extractorController.UpdateAdminRule)
	adminGroup.DELETE("/mail-extractor-rules/:id", extractorController.DeleteAdminRule)
	adminGroup.POST("/mail-extractor-rules/test", extractorController.TestAdminRule)
	adminGroup.GET("/mailboxes/:mailboxId/messages/:id/extractions", extractorController.ListAdminMessageExtractions)
	adminGroup.GET("/configs", systemController.ListConfigs)
	adminGroup.GET("/settings/sections", systemController.ListSettingsSections)
	adminGroup.GET("/settings/api-limits", systemController.APILimitsSettings)
	adminGroup.PUT("/configs/:key", systemController.UpsertConfig)
	adminGroup.DELETE("/configs/:key", systemController.DeleteConfig)
	adminGroup.POST("/configs/mail.delivery/test", systemController.SendMailDeliveryTest)
	adminGroup.GET("/jobs", systemController.ListJobs)
	adminGroup.GET("/jobs/inbound-spool", systemController.ListInboundSpool)
	adminGroup.POST("/jobs/inbound-spool/:id/retry", systemController.RetryInboundSpool)
	adminGroup.GET("/jobs/smtp-metrics", systemController.SMTPMetrics)
	adminGroup.GET("/monitoring", systemController.SystemMonitoring)
	adminGroup.GET("/audit", systemController.ListAudit)

	return engine
}

func MustRunWorker() {
	cfg := config.MustLoadConfig()
	logger.Init(cfg.AppEnv)

	state, err := newRuntimePersistentState(cfg)
	if err != nil {
		log.Fatalf("bootstrap runtime worker: %v", err)
	}

	var syncService jobs.MailboxSyncer
	if cfg.LegacyMailSyncEnabled && strings.TrimSpace(cfg.LegacyMailSyncAPIURL) != "" {
		syncService = ingest.NewLegacySyncService(ingest.NewLegacyMailSyncClient(cfg.LegacyMailSyncAPIURL), state.MessageRepo)
		slog.Info("worker bootstrap ready", "mode", "legacy-mail-sync")
	} else {
		slog.Info("worker bootstrap ready", "mode", "cleanup-only")
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			slog.Info("worker shutdown", "reason", ctx.Err())
			return
		case <-ticker.C:
			if err := runWorkerCycle(ctx, state.MailboxRepo, state.MessageRepo, state.ConfigRepo, state.MailStorage, state.DirectIngest, syncService, state.JobRepo); err != nil {
				slog.Error("worker cycle failed", "error", err)
				continue
			}
			slog.Debug("worker cycle completed")
		}
	}
}

func newMemoryAppState() *AppState {
	authRepo := auth.NewMemoryRepository()
	if err := seedBaseUsers(context.Background(), authRepo); err != nil {
		log.Fatalf("seed local users: %v", err)
	}

	domainRepo := domain.NewMemoryRepository(nil)
	mailboxRepo := mailbox.NewMemoryRepository()
	messageRepo := message.NewMemoryRepository()
	directIngest, mailStorage, err := newDirectIngestService("", mailboxRepo, messageRepo)
	if err != nil {
		log.Fatalf("init direct ingest: %v", err)
	}

	return &AppState{
		AuthRepo:      authRepo,
		DomainRepo:    domainRepo,
		MailboxRepo:   mailboxRepo,
		MessageRepo:   messageRepo,
		RuleRepo:      rule.NewMemoryRepository(),
		ExtractorRepo: extractor.NewMemoryRepository(),
		PortalRepo:    portal.NewMemoryRepository(),
		ConfigRepo:    system.NewMemoryConfigRepository(),
		JobRepo:       system.NewMemoryJobRepository(),
		AuditRepo:     system.NewMemoryAuditRepository(),
		MailStorage:   mailStorage,
		DirectIngest:  directIngest,
	}
}

func newRuntimePersistentState(cfg config.Config) (*AppState, error) {
	ctx := context.Background()

	db, err := database.NewMySQL(cfg.MySQLDSN)
	if err != nil {
		return nil, fmt.Errorf("open mysql: %w", err)
	}
	if err := database.EnsureSchema(ctx, db); err != nil {
		return nil, fmt.Errorf("ensure schema: %w", err)
	}
	if err := ensureSeedRoles(ctx, db, "user", "admin"); err != nil {
		return nil, fmt.Errorf("seed roles: %w", err)
	}

	redisClient := database.NewRedis(cfg.RedisAddr)
	if err := database.PingRedis(ctx, redisClient); err != nil {
		return nil, fmt.Errorf("ping redis: %w", err)
	}
	cache := sharedcache.NewJSONCache(redisClient)

	state := &AppState{
		AuthRepo:      auth.NewPersistentRepository(auth.NewMySQLRepository(db), auth.NewRedisRefreshStore(redisClient)),
		DomainRepo:    domain.NewMySQLRepository(db),
		MailboxRepo:   mailbox.NewMySQLRepository(db),
		MessageRepo:   message.NewMySQLRepository(db),
		RuleRepo:      rule.NewMySQLRepository(db),
		ExtractorRepo: extractor.NewMySQLRepository(db),
		PortalRepo:    portal.NewMySQLRepository(db),
		ConfigRepo:    system.NewMySQLConfigRepository(db),
		JobRepo:       system.NewMySQLJobRepository(db),
		AuditRepo:     system.NewMySQLAuditRepository(db),
		Cache:         cache,
		RedisClient:   redisClient,
		DB:            db,
	}

	state.DirectIngest, state.MailStorage, err = newDirectIngestService(cfg.MailStoragePath, state.MailboxRepo, state.MessageRepo)
	if err != nil {
		return nil, fmt.Errorf("init direct ingest service: %w", err)
	}
	if state.DirectIngest != nil {
		state.DirectIngest.SetSpoolRepository(ingest.NewMySQLSpoolRepository(db))
	}
	if state.DirectIngest != nil {
		state.DirectIngest.SetInboundPolicyProvider(func(ctx context.Context, targets []mailbox.Mailbox) (ingest.InboundPolicy, error) {
			settings, err := system.LoadMailInboundPolicySettings(ctx, state.ConfigRepo)
			if err != nil {
				return ingest.InboundPolicy{}, err
			}
			return resolveInboundPolicyForTargets(settings, targets), nil
		})
	}

	state.WSHub = realtime.NewHub()
	webhookDispatcher := webhook.NewDispatcher(state.PortalRepo, state.DB)
	state.WebhookDispatcher = webhookDispatcher
	messageService := message.NewService(state.MessageRepo, state.MailboxRepo, state.DomainRepo, state.MailStorage, state.Cache)
	if state.DirectIngest != nil {
		state.DirectIngest.SetDeliveryCallback(func(userID uint64, mailboxID uint64, mailboxAddress string, subject string) {
			messageService.InvalidateMailboxListCache(context.Background(), mailboxID)
			state.WSHub.Broadcast(userID, realtime.Event{
				Type: "new_message",
				Payload: map[string]any{
					"mailbox": mailboxAddress,
					"subject": subject,
				},
			})
			webhookDispatcher.Dispatch(context.Background(), userID, "message.received", map[string]any{
				"mailbox": mailboxAddress,
				"subject": subject,
			})
		})
	}

	return state, nil
}

func seedBaseUsers(ctx context.Context, repo auth.UserStore) error {
	if _, err := ensureSeedUser(ctx, repo, "alice", "alice@shiro.local", "Secret123!", []string{"user"}); err != nil {
		return err
	}
	if _, err := ensureSeedUser(ctx, repo, "admin", "admin@shiro.local", "Secret123!", []string{"admin", "user"}); err != nil {
		return err
	}
	return nil
}

func seedRuntimeDemoData(ctx context.Context, state *AppState) error {
	if err := seedBaseUsers(ctx, state.AuthRepo); err != nil {
		return err
	}

	alice, err := state.AuthRepo.FindUserByLogin(ctx, "alice")
	if err != nil {
		return fmt.Errorf("load alice seed user: %w", err)
	}
	adminUser, err := state.AuthRepo.FindUserByLogin(ctx, "admin")
	if err != nil {
		return fmt.Errorf("load admin seed user: %w", err)
	}

	domainsToSeed := []domain.Domain{
		{Domain: "shiro.local", Status: "active", Visibility: "platform_public", PublicationStatus: "published", HealthStatus: "healthy", IsDefault: true, Weight: 100},
		{Domain: "mail.sandbox.test", Status: "active", Visibility: "platform_public", PublicationStatus: "published", HealthStatus: "healthy", IsDefault: false, Weight: 85},
		{Domain: "relay.sh", Status: "active", Visibility: "platform_public", PublicationStatus: "published", HealthStatus: "healthy", IsDefault: false, Weight: 60},
	}

	seededDomains := make(map[string]domain.Domain, len(domainsToSeed))
	for _, item := range domainsToSeed {
		seeded, err := state.DomainRepo.Upsert(ctx, item)
		if err != nil {
			return fmt.Errorf("seed domain %s: %w", item.Domain, err)
		}
		seededDomains[item.Domain] = seeded
	}

	primaryMailbox, err := ensureSeedMailbox(ctx, state.MailboxRepo, alice.ID, mailbox.Mailbox{
		UserID:    alice.ID,
		DomainID:  seededDomains["shiro.local"].ID,
		Domain:    seededDomains["shiro.local"].Domain,
		LocalPart: "alpha",
		Address:   "alpha@shiro.local",
		Status:    "active",
		ExpiresAt: time.Now().Add(24 * time.Hour),
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	})
	if err != nil {
		return fmt.Errorf("seed mailbox alpha@shiro.local: %w", err)
	}

	secondaryMailbox, err := ensureSeedMailbox(ctx, state.MailboxRepo, alice.ID, mailbox.Mailbox{
		UserID:    alice.ID,
		DomainID:  seededDomains["mail.sandbox.test"].ID,
		Domain:    seededDomains["mail.sandbox.test"].Domain,
		LocalPart: "beta",
		Address:   "beta@mail.sandbox.test",
		Status:    "active",
		ExpiresAt: time.Now().Add(72 * time.Hour),
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	})
	if err != nil {
		return fmt.Errorf("seed mailbox beta@mail.sandbox.test: %w", err)
	}

	for _, item := range []struct {
		mailbox mailbox.Mailbox
		message ingest.ParsedMessage
	}{
		{
			mailbox: primaryMailbox,
			message: ingest.ParsedMessage{
				LegacyMailboxKey: primaryMailbox.LocalPart,
				LegacyMessageKey: "seed-primary-1",
				FromAddr:         "hello@neonrail.app",
				ToAddr:           primaryMailbox.Address,
				Subject:          "Welcome aboard the relay",
				TextPreview:      "Your new mailbox is active and ready for traffic.",
				HTMLPreview:      "<p>Your new mailbox is active and ready for traffic.</p>",
				ReceivedAt:       time.Now().Add(-2 * time.Minute),
			},
		},
		{
			mailbox: primaryMailbox,
			message: ingest.ParsedMessage{
				LegacyMailboxKey: primaryMailbox.LocalPart,
				LegacyMessageKey: "seed-primary-2",
				FromAddr:         "alerts@deploy.sh",
				ToAddr:           primaryMailbox.Address,
				Subject:          "Build pipeline finished",
				TextPreview:      "The nightly image passed every check and is waiting for review.",
				HTMLPreview:      "<p>The nightly image passed every check and is waiting for review.</p>",
				IsRead:           true,
				ReceivedAt:       time.Now().Add(-18 * time.Minute),
			},
		},
		{
			mailbox: secondaryMailbox,
			message: ingest.ParsedMessage{
				LegacyMailboxKey: secondaryMailbox.LocalPart,
				LegacyMessageKey: "seed-secondary-1",
				FromAddr:         "ops@domainforge.io",
				ToAddr:           secondaryMailbox.Address,
				Subject:          "Domain weight updated",
				TextPreview:      "The fallback domain has been promoted for tomorrow's load test.",
				HTMLPreview:      "<p>The fallback domain has been promoted for tomorrow's load test.</p>",
				ReceivedAt:       time.Now().Add(-1 * time.Hour),
			},
		},
	} {
		if err := state.MessageRepo.UpsertFromLegacySync(ctx, item.mailbox.ID, item.mailbox.LocalPart, item.message); err != nil {
			return fmt.Errorf("seed message %s: %w", item.message.LegacyMessageKey, err)
		}
	}

	for _, item := range []rule.Rule{
		{ID: "default", Name: "default", RetentionHours: 72, AutoExtend: true},
		{ID: "billing-watch", Name: "billing-watch", RetentionHours: 168, AutoExtend: false},
	} {
		if _, err := state.RuleRepo.Upsert(ctx, item); err != nil {
			return fmt.Errorf("seed rule %s: %w", item.ID, err)
		}
	}

	for key, value := range map[string]map[string]any{
		"platform": {
			"brand":       "Shiro Email",
			"allowSignup": true,
		},
		"mailbox_defaults": {
			"defaultTTLHours": 24,
			"namingStyle":     "hex relay",
		},
	} {
		if _, err := state.ConfigRepo.Upsert(ctx, key, value, adminUser.ID); err != nil {
			return fmt.Errorf("seed config %s: %w", key, err)
		}
	}

	for _, item := range []struct {
		jobType      string
		status       string
		errorMessage string
	}{
		{jobType: "mail_ingest_listener", status: "ok", errorMessage: ""},
		{jobType: "cleanup_expired", status: "ok", errorMessage: ""},
	} {
		if err := ensureSeedJob(ctx, state.JobRepo, item.jobType, item.status, item.errorMessage); err != nil {
			return fmt.Errorf("seed job %s: %w", item.jobType, err)
		}
	}

	for _, item := range []struct {
		action       string
		resourceType string
		resourceID   string
		detail       map[string]any
	}{
		{action: "admin.domain.upsert", resourceType: "domain", resourceID: "mail.sandbox.test", detail: map[string]any{"status": "active"}},
		{action: "admin.rule.upsert", resourceType: "rule", resourceID: "default", detail: map[string]any{"retentionHours": 72}},
		{action: "admin.config.upsert", resourceType: "config", resourceID: "platform", detail: map[string]any{"brand": "Shiro Email"}},
	} {
		if err := ensureSeedAudit(ctx, state.AuditRepo, adminUser.ID, item.action, item.resourceType, item.resourceID, item.detail); err != nil {
			return fmt.Errorf("seed audit %s: %w", item.action, err)
		}
	}

	if err := ensureSeedPortalState(ctx, state, alice); err != nil {
		return fmt.Errorf("seed portal state: %w", err)
	}

	return nil
}

func ensureSeedRoles(ctx context.Context, db *gorm.DB, codes ...string) error {
	for _, code := range codes {
		if err := db.WithContext(ctx).
			Exec(
				"INSERT INTO roles (code, name) VALUES (?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name)",
				code,
				code,
			).Error; err != nil {
			return err
		}
	}
	return nil
}

func ensureSeedUser(ctx context.Context, repo auth.UserStore, username string, email string, password string, roles []string) (auth.User, error) {
	existing, err := repo.FindUserByLogin(ctx, username)
	if err == nil {
		return existing, nil
	}
	if !errors.Is(err, auth.ErrUserNotFound) {
		return auth.User{}, err
	}

	hash, err := security.HashPassword(password)
	if err != nil {
		return auth.User{}, err
	}
	return repo.CreateUser(ctx, auth.User{
		Username:     username,
		Email:        email,
		PasswordHash: hash,
		Roles:        roles,
	})
}

func ensureSeedMailbox(ctx context.Context, repo mailbox.Repository, userID uint64, item mailbox.Mailbox) (mailbox.Mailbox, error) {
	items, err := repo.ListByUserID(ctx, userID)
	if err != nil {
		return mailbox.Mailbox{}, err
	}

	for _, existing := range items {
		if existing.Address != item.Address {
			continue
		}

		existing.DomainID = item.DomainID
		existing.Domain = item.Domain
		existing.LocalPart = item.LocalPart
		existing.Status = item.Status
		existing.ExpiresAt = item.ExpiresAt
		existing.UpdatedAt = time.Now()
		return repo.Update(ctx, existing)
	}

	return repo.Create(ctx, item)
}

func ensureSeedJob(ctx context.Context, repo system.JobRepository, jobType string, status string, errorMessage string) error {
	items, err := repo.List(ctx)
	if err != nil {
		return err
	}

	for _, item := range items {
		if item.JobType == jobType && item.Status == status && item.ErrorMessage == errorMessage {
			return nil
		}
	}

	_, err = repo.Create(ctx, jobType, status, errorMessage)
	return err
}

func ensureSeedAudit(ctx context.Context, repo system.AuditRepository, actorID uint64, action string, resourceType string, resourceID string, detail map[string]any) error {
	items, err := repo.List(ctx)
	if err != nil {
		return err
	}

	for _, item := range items {
		if item.Action == action && item.ResourceType == resourceType && item.ResourceID == resourceID {
			return nil
		}
	}

	_, err = repo.Create(ctx, actorID, action, resourceType, resourceID, detail)
	return err
}

func ensureSeedPortalState(ctx context.Context, state *AppState, user auth.User) error {
	return portal.EnsureDemoData(ctx, state.PortalRepo, user)
}

func newDirectIngestService(root string, mailboxRepo mailbox.Repository, messageRepo message.Repository) (*ingest.DirectService, ingest.FileStorage, error) {
	storageRoot := strings.TrimSpace(root)
	if storageRoot == "" {
		storageRoot = filepath.Join(os.TempDir(), "shiro-email-mail")
	}

	storage, err := ingest.NewLocalFileStorage(storageRoot)
	if err != nil {
		return nil, nil, err
	}
	return ingest.NewDirectService(mailboxRepo, messageRepo, storage), storage, nil
}

func resolveInboundPolicyForTargets(settings system.MailInboundPolicyConfig, targets []mailbox.Mailbox) ingest.InboundPolicy {
	base := ingest.InboundPolicy{
		MaxAttachmentSizeBytes: inboundPolicySizeBytes(settings.MaxAttachmentSizeMB),
		RejectExecutableFiles:  settings.RejectExecutableFiles,
	}
	if len(targets) == 0 {
		return base
	}

	effective := ingest.InboundPolicy{}
	firstTarget := true
	for _, target := range targets {
		current := base
		domainName := strings.ToLower(strings.TrimSpace(target.Domain))
		if override, ok := settings.DomainOverrides[domainName]; ok && override.Enabled {
			current = ingest.InboundPolicy{
				MaxAttachmentSizeBytes: inboundPolicySizeBytes(override.MaxAttachmentSizeMB),
				RejectExecutableFiles:  override.RejectExecutableFiles,
			}
		}

		if firstTarget {
			effective = current
			firstTarget = false
			continue
		}
		effective = mergeRestrictiveInboundPolicy(effective, current)
	}
	return effective
}

func inboundPolicySizeBytes(sizeMB int) int64 {
	if sizeMB <= 0 {
		return 0
	}
	return int64(sizeMB) * 1024 * 1024
}

func mergeRestrictiveInboundPolicy(current ingest.InboundPolicy, next ingest.InboundPolicy) ingest.InboundPolicy {
	switch {
	case current.MaxAttachmentSizeBytes <= 0:
		current.MaxAttachmentSizeBytes = next.MaxAttachmentSizeBytes
	case next.MaxAttachmentSizeBytes > 0 && next.MaxAttachmentSizeBytes < current.MaxAttachmentSizeBytes:
		current.MaxAttachmentSizeBytes = next.MaxAttachmentSizeBytes
	}
	current.RejectExecutableFiles = current.RejectExecutableFiles || next.RejectExecutableFiles
	return current
}

func parseRedisInfoInt64(info string, key string) int64 {
	prefix := key + ":"
	for _, line := range strings.Split(info, "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, prefix) {
			valStr := strings.TrimPrefix(line, prefix)
			val, _ := strconv.ParseInt(strings.TrimSpace(valStr), 10, 64)
			return val
		}
	}
	return 0
}

func parseRedisInfoString(info string, key string) string {
	prefix := key + ":"
	for _, line := range strings.Split(info, "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, prefix) {
			return strings.TrimSpace(strings.TrimPrefix(line, prefix))
		}
	}
	return ""
}

type webhookTesterAdapter struct {
	dispatcher *webhook.Dispatcher
}

func (a *webhookTesterAdapter) TestDeliver(ctx context.Context, userID uint64, wh portal.Webhook) portal.WebhookTestResult {
	result := a.dispatcher.TestDeliver(ctx, userID, wh)
	return portal.WebhookTestResult{
		Success:        result.Success,
		ResponseStatus: result.ResponseStatus,
		ResponseBody:   result.ResponseBody,
		LatencyMs:      result.LatencyMs,
		ErrorMessage:   result.ErrorMessage,
	}
}
