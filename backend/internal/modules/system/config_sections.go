package system

import (
	"context"
	"strings"
)

type SiteIdentityConfig struct {
	SiteName        string `json:"siteName"`
	Slogan          string `json:"slogan"`
	SupportEmail    string `json:"supportEmail"`
	SiteIconURL     string `json:"siteIconUrl"`
	AppBaseURL      string `json:"appBaseUrl"`
	DefaultLanguage string `json:"defaultLanguage"`
	DefaultTimeZone string `json:"defaultTimeZone"`
	AmbientThemeEnabled   bool   `json:"ambientThemeEnabled"`
	AmbientThemeIntensity string `json:"ambientThemeIntensity"`
}

type AuthRegistrationPolicyConfig struct {
	RegistrationMode         string `json:"registrationMode"`
	AllowRegistration        bool   `json:"allowRegistration"`
	RequireEmailVerification bool   `json:"requireEmailVerification"`
	InviteOnly               bool   `json:"inviteOnly"`
}

type AuthPasswordPolicyConfig struct {
	MinLength         int  `json:"minLength"`
	RequireUppercase  bool `json:"requireUppercase"`
	RequireNumber     bool `json:"requireNumber"`
	RequireSpecial    bool `json:"requireSpecial"`
	PasswordResetable bool `json:"passwordResetable"`
}

type AuthSessionPolicyConfig struct {
	AccessTokenMinutes    int  `json:"accessTokenMinutes"`
	RefreshTokenDays      int  `json:"refreshTokenDays"`
	AllowMultiSession     bool `json:"allowMultiSession"`
	EnableMFA             bool `json:"enableMFA"`
	LockoutThreshold      int  `json:"lockoutThreshold"`
	LockoutDurationMinute int  `json:"lockoutDurationMinutes"`
}

type AuthOAuthDisplayConfig struct {
	ShowOnLogin    bool     `json:"showOnLogin"`
	ProviderOrder  []string `json:"providerOrder"`
	AutoLinkByMail bool     `json:"autoLinkByEmail"`
}

type AuthOAuthProviderConfig struct {
	Enabled           bool     `json:"enabled"`
	ClientID          string   `json:"clientId"`
	ClientSecret      string   `json:"clientSecret"`
	RedirectURL       string   `json:"redirectUrl"`
	AuthorizationURL  string   `json:"authorizationUrl"`
	TokenURL          string   `json:"tokenUrl"`
	UserInfoURL       string   `json:"userInfoUrl"`
	Scopes            []string `json:"scopes"`
	UsePKCE           bool     `json:"usePkce"`
	AllowAutoRegister bool     `json:"allowAutoRegister"`
	AllowLinkExisting bool     `json:"allowLinkExisting"`
	OverwriteProfile  bool     `json:"overwriteProfile"`
	DisplayName       string   `json:"displayName"`
}

type MailSMTPConfig struct {
	Enabled         bool   `json:"enabled"`
	ListenAddr      string `json:"listenAddr"`
	Hostname        string `json:"hostname"`
	DKIMCnameTarget string `json:"dkimCnameTarget"`
	MaxMessageBytes int    `json:"maxMessageBytes"`
}

type MailDeliveryConfig struct {
	Enabled            bool   `json:"enabled"`
	Host               string `json:"host"`
	Port               int    `json:"port"`
	Username           string `json:"username"`
	Password           string `json:"password"`
	FromAddress        string `json:"fromAddress"`
	FromName           string `json:"fromName"`
	TransportMode      string `json:"transportMode"`
	InsecureSkipVerify bool   `json:"insecureSkipVerify"`
}

type MailInboundPolicyConfig struct {
	AllowCatchAll             bool                                     `json:"allowCatchAll"`
	RequireExistingMailbox    bool                                     `json:"requireExistingMailbox"`
	RetainRawDays             int                                      `json:"retainRawDays"`
	MaxAttachmentSizeMB       int                                      `json:"maxAttachmentSizeMB"`
	RejectExecutableFiles     bool                                     `json:"rejectExecutableFiles"`
	EnableSpamScanningPreview bool                                     `json:"enableSpamScanningPreview"`
	DomainOverrides           map[string]MailInboundPolicyDomainConfig `json:"domainOverrides"`
}

type MailInboundPolicyDomainConfig struct {
	Enabled               bool `json:"enabled"`
	MaxAttachmentSizeMB   int  `json:"maxAttachmentSizeMB"`
	RejectExecutableFiles bool `json:"rejectExecutableFiles"`
}

type APILimitsConfig struct {
	Enabled                     bool   `json:"enabled"`
	IdentityMode                string `json:"identityMode"`
	AnonymousRPM                int    `json:"anonymousRPM"`
	AuthenticatedRPM            int    `json:"authenticatedRPM"`
	AuthRPM                     int    `json:"authRPM"`
	LoginRPM                    int    `json:"loginRPM"`
	RegisterRPM                 int    `json:"registerRPM"`
	RefreshRPM                  int    `json:"refreshRPM"`
	ForgotPasswordRPM           int    `json:"forgotPasswordRPM"`
	ResetPasswordRPM            int    `json:"resetPasswordRPM"`
	EmailVerificationResendRPM  int    `json:"emailVerificationResendRPM"`
	EmailVerificationConfirmRPM int    `json:"emailVerificationConfirmRPM"`
	OAuthStartRPM               int    `json:"oauthStartRPM"`
	OAuthCallbackRPM            int    `json:"oauthCallbackRPM"`
	Login2FAVerifyRPM           int    `json:"login2faVerifyRPM"`
	MailboxWriteRPM             int    `json:"mailboxWriteRPM"`
	StrictIPEnabled             bool   `json:"strictIpEnabled"`
	StrictIPRPM                 int    `json:"strictIpRPM"`
}

type AuthRuntimeSettings struct {
	Registration AuthRegistrationPolicyConfig       `json:"registration"`
	Password     AuthPasswordPolicyConfig           `json:"password"`
	Session      AuthSessionPolicyConfig            `json:"session"`
	OAuthDisplay AuthOAuthDisplayConfig             `json:"oauthDisplay"`
	OAuth        map[string]AuthOAuthProviderConfig `json:"oauth"`
}

type PublicSiteSettings struct {
	Identity SiteIdentityConfig `json:"identity"`
	MailDNS  PublicMailDNSHints `json:"mailDns"`
}

type PublicMailDNSHints struct {
	MXTarget        string `json:"mxTarget"`
	DKIMCnameTarget string `json:"dkimCnameTarget"`
}

type SettingsSectionDefinition struct {
	Key         string
	Title       string
	Description string
	ConfigKeys  []string
}

var settingsSectionDefinitions = []SettingsSectionDefinition{
	{
		Key:         "site",
		Title:       "站点信息",
		Description: "品牌名、联系邮箱、默认语言与时区。",
		ConfigKeys:  []string{ConfigKeySiteIdentity},
	},
	{
		Key:         "auth",
		Title:       "认证与注册",
		Description: "注册开放策略、密码规则、会话策略。",
		ConfigKeys: []string{
			ConfigKeyAuthRegistrationPolicy,
			ConfigKeyAuthPasswordPolicy,
			ConfigKeyAuthSessionPolicy,
		},
	},
	{
		Key:         "oauth",
		Title:       "OAuth / OIDC",
		Description: "第三方登录展示顺序与 provider 凭据。",
		ConfigKeys:  []string{ConfigKeyAuthOAuthDisplay},
	},
	{
		Key:         "mail",
		Title:       "收件与 SMTP",
		Description: "SMTP 收件监听、账户邮件投递与收件策略。",
		ConfigKeys:  []string{ConfigKeyMailSMTP, ConfigKeyMailDelivery, ConfigKeyMailInboundPolicy},
	},
	{
		Key:         "api",
		Title:       "API 设置",
		Description: "API 速率限制、鉴权身份桶与严格 IP 限流策略。",
		ConfigKeys:  []string{ConfigKeyAPILimits},
	},
	{
		Key:         "domain",
		Title:       "域名平台策略",
		Description: "公开域发布审核等平台级域名策略。",
		ConfigKeys:  []string{ConfigKeyDomainPublicPoolPolicy},
	},
}

func defaultConfigValueForKey(key string) map[string]any {
	switch key {
	case ConfigKeySiteIdentity:
		return map[string]any{
			"siteName":        "Shiro Email",
			"slogan":          "Enterprise temporary mail platform",
			"supportEmail":    "support@shiro.local",
			"siteIconUrl":     "",
			"appBaseUrl":      "http://localhost:5173",
			"defaultLanguage": "zh-CN",
			"defaultTimeZone": "Asia/Shanghai",
			"ambientThemeEnabled":   true,
			"ambientThemeIntensity": "balanced",
		}
	case ConfigKeyAuthRegistrationPolicy:
		return map[string]any{
			"registrationMode":         "public",
			"allowRegistration":        true,
			"requireEmailVerification": false,
			"inviteOnly":               false,
		}
	case ConfigKeyAuthPasswordPolicy:
		return map[string]any{
			"minLength":         8,
			"requireUppercase":  true,
			"requireNumber":     true,
			"requireSpecial":    false,
			"passwordResetable": true,
		}
	case ConfigKeyAuthSessionPolicy:
		return map[string]any{
			"accessTokenMinutes":     60,
			"refreshTokenDays":       7,
			"allowMultiSession":      true,
			"enableMFA":              false,
			"lockoutThreshold":       5,
			"lockoutDurationMinutes": 30,
		}
	case ConfigKeyAuthOAuthDisplay:
		return map[string]any{
			"showOnLogin":     true,
			"providerOrder":   []any{},
			"autoLinkByEmail": true,
		}
	case ConfigKeyMailSMTP:
		return map[string]any{
			"enabled":         true,
			"listenAddr":      ":2525",
			"hostname":        legacySMTPHostname,
			"dkimCnameTarget": legacyDKIMTarget,
			"maxMessageBytes": 10485760,
		}
	case ConfigKeyMailDelivery:
		return map[string]any{
			"enabled":            false,
			"host":               "",
			"port":               587,
			"username":           "",
			"password":           "",
			"fromAddress":        "",
			"fromName":           "Shiro Email",
			"transportMode":      "starttls",
			"insecureSkipVerify": false,
		}
	case ConfigKeyMailInboundPolicy:
		return map[string]any{
			"allowCatchAll":             false,
			"requireExistingMailbox":    true,
			"retainRawDays":             30,
			"maxAttachmentSizeMB":       15,
			"rejectExecutableFiles":     true,
			"enableSpamScanningPreview": false,
			"domainOverrides":           map[string]any{},
		}
	case ConfigKeyAPILimits:
		return map[string]any{
			"enabled":                     true,
			"identityMode":                "bearer_or_ip",
			"anonymousRPM":                120,
			"authenticatedRPM":            600,
			"authRPM":                     10,
			"loginRPM":                    10,
			"registerRPM":                 10,
			"refreshRPM":                  30,
			"forgotPasswordRPM":           10,
			"resetPasswordRPM":            10,
			"emailVerificationResendRPM":  10,
			"emailVerificationConfirmRPM": 30,
			"oauthStartRPM":               20,
			"oauthCallbackRPM":            20,
			"login2faVerifyRPM":           20,
			"mailboxWriteRPM":             1200,
			"strictIpEnabled":             false,
			"strictIpRPM":                 1800,
		}
	case ConfigKeyDomainPublicPoolPolicy:
		return map[string]any{
			"requiresReview": true,
		}
	default:
		if strings.HasPrefix(key, "auth.oauth.providers.") {
			return defaultGenericOAuthProviderValue()
		}
		return map[string]any{}
	}
}

func defaultOAuthProviderValue(displayName string, authorizationURL string, tokenURL string, userInfoURL string, scopes []any) map[string]any {
	return map[string]any{
		"enabled":           false,
		"clientId":          "",
		"clientSecret":      "",
		"redirectUrl":       "",
		"authorizationUrl":  authorizationURL,
		"tokenUrl":          tokenURL,
		"userInfoUrl":       userInfoURL,
		"scopes":            scopes,
		"usePkce":           true,
		"allowAutoRegister": true,
		"allowLinkExisting": true,
		"overwriteProfile":  false,
		"displayName":       displayName,
	}
}

func defaultGenericOAuthProviderValue() map[string]any {
	return map[string]any{
		"enabled":           false,
		"clientId":          "",
		"clientSecret":      "",
		"redirectUrl":       "",
		"authorizationUrl":  "",
		"tokenUrl":          "",
		"userInfoUrl":       "",
		"scopes":            []any{},
		"usePkce":           true,
		"allowAutoRegister": true,
		"allowLinkExisting": true,
		"overwriteProfile":  false,
		"displayName":       "",
	}
}

func normalizeOAuthProviderFields(base map[string]any) {
	base["enabled"] = normalizeBool(base["enabled"], false)
	base["clientId"] = normalizeString(base["clientId"], "")
	base["clientSecret"] = normalizeString(base["clientSecret"], "")
	base["redirectUrl"] = normalizeString(base["redirectUrl"], "")
	base["authorizationUrl"] = normalizeString(base["authorizationUrl"], "")
	base["tokenUrl"] = normalizeString(base["tokenUrl"], "")
	base["userInfoUrl"] = normalizeString(base["userInfoUrl"], "")
	base["scopes"] = normalizeStringSliceAny(base["scopes"], nil)
	base["usePkce"] = normalizeBool(base["usePkce"], true)
	base["allowAutoRegister"] = normalizeBool(base["allowAutoRegister"], true)
	base["allowLinkExisting"] = normalizeBool(base["allowLinkExisting"], true)
	base["overwriteProfile"] = normalizeBool(base["overwriteProfile"], false)
	base["displayName"] = normalizeString(base["displayName"], "")
}

func normalizeConfigValue(key string, value map[string]any) map[string]any {
	base := defaultConfigValueForKey(key)
	for currentKey, currentValue := range cloneMap(value) {
		base[currentKey] = currentValue
	}

	switch {
	case key == ConfigKeyAuthRegistrationPolicy:
		base["registrationMode"] = normalizeString(base["registrationMode"], "public")
		base["allowRegistration"] = normalizeBool(base["allowRegistration"], true)
		base["requireEmailVerification"] = normalizeBool(base["requireEmailVerification"], false)
		base["inviteOnly"] = normalizeBool(base["inviteOnly"], false)
	case key == ConfigKeyAuthPasswordPolicy:
		base["minLength"] = normalizeInt(base["minLength"], 8)
		base["requireUppercase"] = normalizeBool(base["requireUppercase"], true)
		base["requireNumber"] = normalizeBool(base["requireNumber"], true)
		base["requireSpecial"] = normalizeBool(base["requireSpecial"], false)
		base["passwordResetable"] = normalizeBool(base["passwordResetable"], true)
	case key == ConfigKeyAuthSessionPolicy:
		base["accessTokenMinutes"] = normalizeInt(base["accessTokenMinutes"], 60)
		base["refreshTokenDays"] = normalizeInt(base["refreshTokenDays"], 7)
		base["allowMultiSession"] = normalizeBool(base["allowMultiSession"], true)
		base["enableMFA"] = normalizeBool(base["enableMFA"], false)
		base["lockoutThreshold"] = normalizeInt(base["lockoutThreshold"], 5)
		base["lockoutDurationMinutes"] = normalizeInt(base["lockoutDurationMinutes"], 30)
	case key == ConfigKeyAuthOAuthDisplay:
		base["showOnLogin"] = normalizeBool(base["showOnLogin"], true)
		base["providerOrder"] = normalizeStringSliceAny(base["providerOrder"], []string{})
		base["autoLinkByEmail"] = normalizeBool(base["autoLinkByEmail"], true)
	case strings.HasPrefix(key, "auth.oauth.providers."):
		normalizeOAuthProviderFields(base)
	case key == ConfigKeyMailSMTP:
		base["enabled"] = normalizeBool(base["enabled"], true)
		base["listenAddr"] = normalizeString(base["listenAddr"], ":2525")
		base["hostname"] = normalizeString(base["hostname"], legacySMTPHostname)
		base["dkimCnameTarget"] = normalizeString(base["dkimCnameTarget"], legacyDKIMTarget)
		base["maxMessageBytes"] = normalizeInt(base["maxMessageBytes"], 10485760)
	case key == ConfigKeyMailDelivery:
		base["enabled"] = normalizeBool(base["enabled"], false)
		base["host"] = normalizeString(base["host"], "")
		base["port"] = normalizeInt(base["port"], 587)
		base["username"] = normalizeString(base["username"], "")
		base["password"] = normalizeString(base["password"], "")
		base["fromAddress"] = normalizeString(base["fromAddress"], "")
		base["fromName"] = normalizeString(base["fromName"], "Shiro Email")
		base["transportMode"] = normalizeMailTransportMode(base["transportMode"])
		base["insecureSkipVerify"] = normalizeBool(base["insecureSkipVerify"], false)
	case key == ConfigKeyMailInboundPolicy:
		base["allowCatchAll"] = normalizeBool(base["allowCatchAll"], false)
		base["requireExistingMailbox"] = normalizeBool(base["requireExistingMailbox"], true)
		base["retainRawDays"] = normalizeInt(base["retainRawDays"], 30)
		base["maxAttachmentSizeMB"] = normalizeInt(base["maxAttachmentSizeMB"], 15)
		base["rejectExecutableFiles"] = normalizeBool(base["rejectExecutableFiles"], true)
		base["enableSpamScanningPreview"] = normalizeBool(base["enableSpamScanningPreview"], false)
		base["domainOverrides"] = normalizeMailInboundPolicyDomainOverrides(base["domainOverrides"])
	case key == ConfigKeyAPILimits:
		base["enabled"] = normalizeBool(base["enabled"], true)
		base["identityMode"] = normalizeRateLimitIdentityMode(base["identityMode"])
		base["anonymousRPM"] = normalizeInt(base["anonymousRPM"], 120)
		base["authenticatedRPM"] = normalizeInt(base["authenticatedRPM"], 600)
		base["authRPM"] = normalizeInt(base["authRPM"], 10)
		base["loginRPM"] = normalizeInt(base["loginRPM"], 10)
		base["registerRPM"] = normalizeInt(base["registerRPM"], 10)
		base["refreshRPM"] = normalizeInt(base["refreshRPM"], 30)
		base["forgotPasswordRPM"] = normalizeInt(base["forgotPasswordRPM"], 10)
		base["resetPasswordRPM"] = normalizeInt(base["resetPasswordRPM"], 10)
		base["emailVerificationResendRPM"] = normalizeInt(base["emailVerificationResendRPM"], 10)
		base["emailVerificationConfirmRPM"] = normalizeInt(base["emailVerificationConfirmRPM"], 30)
		base["oauthStartRPM"] = normalizeInt(base["oauthStartRPM"], 20)
		base["oauthCallbackRPM"] = normalizeInt(base["oauthCallbackRPM"], 20)
		base["login2faVerifyRPM"] = normalizeInt(base["login2faVerifyRPM"], 20)
		base["mailboxWriteRPM"] = normalizeInt(base["mailboxWriteRPM"], 1200)
		base["strictIpEnabled"] = normalizeBool(base["strictIpEnabled"], false)
		base["strictIpRPM"] = normalizeInt(base["strictIpRPM"], 1800)
	case key == ConfigKeyDomainPublicPoolPolicy:
		base["requiresReview"] = normalizeBool(base["requiresReview"], true)
	case key == ConfigKeySiteIdentity:
		base["siteName"] = normalizeString(base["siteName"], "Shiro Email")
		base["slogan"] = normalizeString(base["slogan"], "")
		base["supportEmail"] = normalizeString(base["supportEmail"], "")
		base["siteIconUrl"] = normalizeString(base["siteIconUrl"], "")
		base["appBaseUrl"] = normalizeString(base["appBaseUrl"], "http://localhost:5173")
		base["defaultLanguage"] = normalizeString(base["defaultLanguage"], "zh-CN")
		base["defaultTimeZone"] = normalizeString(base["defaultTimeZone"], "Asia/Shanghai")
		base["ambientThemeEnabled"] = normalizeBool(base["ambientThemeEnabled"], true)
		base["ambientThemeIntensity"] = normalizeAmbientThemeIntensity(base["ambientThemeIntensity"])
	}

	return base
}

func normalizeString(value any, fallback string) string {
	if cast, ok := value.(string); ok && cast != "" {
		return cast
	}
	return fallback
}

func normalizeMailInboundPolicyDomainOverrides(value any) map[string]any {
	raw, ok := value.(map[string]any)
	if !ok || raw == nil {
		return map[string]any{}
	}

	normalized := make(map[string]any, len(raw))
	for domainName, overrideValue := range raw {
		trimmedDomain := strings.ToLower(strings.TrimSpace(domainName))
		if trimmedDomain == "" {
			continue
		}

		overrideMap, ok := overrideValue.(map[string]any)
		if !ok || overrideMap == nil {
			continue
		}

		normalized[trimmedDomain] = map[string]any{
			"enabled":               normalizeBool(overrideMap["enabled"], false),
			"maxAttachmentSizeMB":   normalizeInt(overrideMap["maxAttachmentSizeMB"], 15),
			"rejectExecutableFiles": normalizeBool(overrideMap["rejectExecutableFiles"], true),
		}
	}

	return normalized
}

func normalizeMailTransportMode(value any) string {
	mode := strings.ToLower(strings.TrimSpace(normalizeString(value, "starttls")))
	switch mode {
	case "plain", "starttls", "smtps":
		return mode
	default:
		return "starttls"
	}
}

func normalizeRateLimitIdentityMode(value any) string {
	mode := strings.ToLower(strings.TrimSpace(normalizeString(value, "bearer_or_ip")))
	switch mode {
	case "ip", "bearer_or_ip":
		return mode
	default:
		return "bearer_or_ip"
	}
}

func normalizeAmbientThemeIntensity(value any) string {
	intensity := strings.ToLower(strings.TrimSpace(normalizeString(value, "balanced")))
	switch intensity {
	case "subtle", "balanced", "vivid":
		return intensity
	default:
		return "balanced"
	}
}

func normalizeBool(value any, fallback bool) bool {
	if cast, ok := value.(bool); ok {
		return cast
	}
	return fallback
}

func normalizeInt(value any, fallback int) int {
	switch cast := value.(type) {
	case int:
		return cast
	case int32:
		return int(cast)
	case int64:
		return int(cast)
	case float64:
		return int(cast)
	case float32:
		return int(cast)
	default:
		return fallback
	}
}

func normalizeStringSliceAny(value any, fallback []string) []any {
	switch cast := value.(type) {
	case []any:
		output := make([]any, 0, len(cast))
		for _, item := range cast {
			text, ok := item.(string)
			if ok && text != "" {
				output = append(output, text)
			}
		}
		if len(output) > 0 || len(fallback) == 0 {
			return output
		}
	case []string:
		output := make([]any, 0, len(cast))
		for _, item := range cast {
			if item != "" {
				output = append(output, item)
			}
		}
		if len(output) > 0 || len(fallback) == 0 {
			return output
		}
	}

	output := make([]any, 0, len(fallback))
	for _, item := range fallback {
		output = append(output, item)
	}
	return output
}

func normalizeConfigEntry(item ConfigEntry) ConfigEntry {
	item.Value = normalizeConfigValue(item.Key, item.Value)
	return item
}

func NormalizeConfigEntryForTest(item ConfigEntry) ConfigEntry {
	return normalizeConfigEntry(item)
}

func defaultConfigEntries() []ConfigEntry {
	keys := []string{
		ConfigKeySiteIdentity,
		ConfigKeyAuthRegistrationPolicy,
		ConfigKeyAuthPasswordPolicy,
		ConfigKeyAuthSessionPolicy,
		ConfigKeyAuthOAuthDisplay,
		ConfigKeyMailSMTP,
		ConfigKeyMailDelivery,
		ConfigKeyMailInboundPolicy,
		ConfigKeyAPILimits,
		ConfigKeyDomainPublicPoolPolicy,
	}

	items := make([]ConfigEntry, 0, len(keys))
	for _, key := range keys {
		items = append(items, ConfigEntry{Key: key, Value: defaultConfigValueForKey(key)})
	}
	return items
}

func LoadPublicSiteSettings(ctx context.Context, repo ConfigRepository) (PublicSiteSettings, error) {
	settings := PublicSiteSettings{
		MailDNS: PublicMailDNSHints{
			MXTarget:        legacySMTPHostname,
			DKIMCnameTarget: legacyDKIMTarget,
		},
	}

	var items []ConfigEntry
	var err error
	if repo == nil {
		items = defaultConfigEntries()
	} else {
		items, err = repo.List(ctx)
		if err != nil {
			return settings, err
		}
		items = mergeConfigEntries(items)
	}

	for _, item := range items {
		switch item.Key {
		case ConfigKeySiteIdentity:
			settings.Identity = SiteIdentityConfig{
				SiteName:        normalizeString(item.Value["siteName"], "Shiro Email"),
				Slogan:          normalizeString(item.Value["slogan"], ""),
				SupportEmail:    normalizeString(item.Value["supportEmail"], ""),
				SiteIconURL:     normalizeString(item.Value["siteIconUrl"], ""),
				AppBaseURL:      normalizeString(item.Value["appBaseUrl"], "http://localhost:5173"),
				DefaultLanguage: normalizeString(item.Value["defaultLanguage"], "zh-CN"),
				DefaultTimeZone: normalizeString(item.Value["defaultTimeZone"], "Asia/Shanghai"),
				AmbientThemeEnabled:   normalizeBool(item.Value["ambientThemeEnabled"], true),
				AmbientThemeIntensity: normalizeAmbientThemeIntensity(item.Value["ambientThemeIntensity"]),
			}
		case ConfigKeyMailSMTP:
			settings.MailDNS = PublicMailDNSHints{
				MXTarget:        normalizeString(item.Value["hostname"], legacySMTPHostname),
				DKIMCnameTarget: normalizeString(item.Value["dkimCnameTarget"], legacyDKIMTarget),
			}
		}
	}

	if derivedMX, derivedDKIM, ok := deriveMailTargetsFromAppBaseURL(settings.Identity.AppBaseURL); ok {
		if shouldUseDerivedMailTarget(settings.MailDNS.MXTarget) {
			settings.MailDNS.MXTarget = derivedMX
		}
		if shouldUseDerivedMailTarget(settings.MailDNS.DKIMCnameTarget) {
			settings.MailDNS.DKIMCnameTarget = derivedDKIM
		}
	}

	return settings, nil
}

func LoadAuthRuntimeSettings(ctx context.Context, repo ConfigRepository) (AuthRuntimeSettings, error) {
	settings := AuthRuntimeSettings{
		OAuth: map[string]AuthOAuthProviderConfig{},
	}

	if repo == nil {
		items := defaultConfigEntries()
		applyAuthRuntimeSettings(items, &settings)
		return settings, nil
	}

	items, err := repo.List(ctx)
	if err != nil {
		return settings, err
	}
	applyAuthRuntimeSettings(mergeConfigEntries(items), &settings)
	return settings, nil
}

func applyAuthRuntimeSettings(items []ConfigEntry, settings *AuthRuntimeSettings) {
	for _, item := range items {
		switch {
		case item.Key == ConfigKeyAuthRegistrationPolicy:
			settings.Registration = AuthRegistrationPolicyConfig{
				RegistrationMode:         normalizeString(item.Value["registrationMode"], "public"),
				AllowRegistration:        normalizeBool(item.Value["allowRegistration"], true),
				RequireEmailVerification: normalizeBool(item.Value["requireEmailVerification"], false),
				InviteOnly:               normalizeBool(item.Value["inviteOnly"], false),
			}
		case item.Key == ConfigKeyAuthPasswordPolicy:
			settings.Password = AuthPasswordPolicyConfig{
				MinLength:         normalizeInt(item.Value["minLength"], 8),
				RequireUppercase:  normalizeBool(item.Value["requireUppercase"], true),
				RequireNumber:     normalizeBool(item.Value["requireNumber"], true),
				RequireSpecial:    normalizeBool(item.Value["requireSpecial"], false),
				PasswordResetable: normalizeBool(item.Value["passwordResetable"], true),
			}
		case item.Key == ConfigKeyAuthSessionPolicy:
			settings.Session = AuthSessionPolicyConfig{
				AccessTokenMinutes:    normalizeInt(item.Value["accessTokenMinutes"], 60),
				RefreshTokenDays:      normalizeInt(item.Value["refreshTokenDays"], 7),
				AllowMultiSession:     normalizeBool(item.Value["allowMultiSession"], true),
				EnableMFA:             normalizeBool(item.Value["enableMFA"], false),
				LockoutThreshold:      normalizeInt(item.Value["lockoutThreshold"], 5),
				LockoutDurationMinute: normalizeInt(item.Value["lockoutDurationMinutes"], 30),
			}
		case item.Key == ConfigKeyAuthOAuthDisplay:
			settings.OAuthDisplay = AuthOAuthDisplayConfig{
				ShowOnLogin:    normalizeBool(item.Value["showOnLogin"], true),
				ProviderOrder:  normalizeStringSlice(item.Value["providerOrder"], []string{}),
				AutoLinkByMail: normalizeBool(item.Value["autoLinkByEmail"], true),
			}
		case strings.HasPrefix(item.Key, "auth.oauth.providers."):
			providerName := strings.TrimPrefix(item.Key, "auth.oauth.providers.")
			if providerName != "" {
				settings.OAuth[providerName] = readOAuthProviderConfig(item)
			}
		}
	}
}

func readOAuthProviderConfig(item ConfigEntry) AuthOAuthProviderConfig {
	return AuthOAuthProviderConfig{
		Enabled:           normalizeBool(item.Value["enabled"], false),
		ClientID:          normalizeString(item.Value["clientId"], ""),
		ClientSecret:      normalizeString(item.Value["clientSecret"], ""),
		RedirectURL:       normalizeString(item.Value["redirectUrl"], ""),
		AuthorizationURL:  normalizeString(item.Value["authorizationUrl"], ""),
		TokenURL:          normalizeString(item.Value["tokenUrl"], ""),
		UserInfoURL:       normalizeString(item.Value["userInfoUrl"], ""),
		Scopes:            normalizeStringSlice(item.Value["scopes"], nil),
		UsePKCE:           normalizeBool(item.Value["usePkce"], true),
		AllowAutoRegister: normalizeBool(item.Value["allowAutoRegister"], true),
		AllowLinkExisting: normalizeBool(item.Value["allowLinkExisting"], true),
		OverwriteProfile:  normalizeBool(item.Value["overwriteProfile"], false),
		DisplayName:       normalizeString(item.Value["displayName"], ""),
	}
}

func normalizeStringSlice(value any, fallback []string) []string {
	switch cast := value.(type) {
	case []string:
		return append([]string{}, cast...)
	case []any:
		output := make([]string, 0, len(cast))
		for _, item := range cast {
			text, ok := item.(string)
			if ok && text != "" {
				output = append(output, text)
			}
		}
		if len(output) > 0 || len(fallback) == 0 {
			return output
		}
	}
	return append([]string{}, fallback...)
}
