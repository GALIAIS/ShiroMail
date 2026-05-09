import {
  validateEmailAddress,
  validateHTTPUrl,
  validateImageSourceUrl,
  validateIntegerRange,
  validateRequiredText,
  validateSelection,
} from "@/lib/validation";
import type {
  AuthPasswordSettings,
  AuthRegistrationSettings,
  AuthSessionSettings,
  APILimitsSettings,
  MailDeliverySettings,
  MailInboundSettings,
  MailSMTPSettings,
  OAuthProviderSettings,
  SiteIdentitySettings,
} from "../settings/types";

export function validateAdminSettingsSnapshot(input: {
  siteIdentity: SiteIdentitySettings;
  registration: AuthRegistrationSettings;
  password: AuthPasswordSettings;
  session: AuthSessionSettings;
  smtp: MailSMTPSettings;
  delivery: MailDeliverySettings;
  inbound: MailInboundSettings;
  apiLimits: APILimitsSettings;
  oauthProviders: OAuthProviderSettings[];
}) {
  const siteError =
    validateRequiredText("站点名称", input.siteIdentity.siteName, { minLength: 2, maxLength: 80 }) ||
    validateEmailAddress(input.siteIdentity.supportEmail) ||
    (input.siteIdentity.siteIconUrl.trim().length > 0
      ? validateImageSourceUrl(input.siteIdentity.siteIconUrl, "站点图标 URL")
      : null) ||
    validateHTTPUrl(input.siteIdentity.appBaseUrl, "站点地址") ||
    validateRequiredText("默认语言", input.siteIdentity.defaultLanguage, { minLength: 2, maxLength: 16 }) ||
    validateRequiredText("默认时区", input.siteIdentity.defaultTimeZone, { minLength: 2, maxLength: 64 }) ||
    validateSelection("动态主题强度", input.siteIdentity.ambientThemeIntensity, ["subtle", "balanced", "vivid"]);
  if (siteError) {
    return siteError;
  }

  const registrationError = validateSelection("注册模式", input.registration.registrationMode, ["public", "invite_only", "closed"]);
  if (registrationError) {
    return registrationError;
  }

  const passwordError = validateIntegerRange("密码最小长度", input.password.minLength, { min: 6, max: 128 });
  if (passwordError) {
    return passwordError;
  }

  const sessionError =
    validateIntegerRange("Access Token 分钟", input.session.accessTokenMinutes, { min: 1, max: 1440 }) ||
    validateIntegerRange("Refresh Token 天数", input.session.refreshTokenDays, { min: 1, max: 365 }) ||
    validateIntegerRange("锁定阈值", input.session.lockoutThreshold, { min: 1, max: 20 }) ||
    validateIntegerRange("锁定分钟", input.session.lockoutDurationMinutes, { min: 1, max: 1440 });
  if (sessionError) {
    return sessionError;
  }

  const smtpError =
    validateRequiredText("SMTP Hostname / MX Target", input.smtp.hostname, { minLength: 3, maxLength: 253 }) ||
    validateRequiredText("监听地址", input.smtp.listenAddr, { minLength: 3, maxLength: 128 }) ||
    validateIntegerRange("最大消息字节", input.smtp.maxMessageBytes, { min: 1024, max: 104857600 });
  if (smtpError) {
    return smtpError;
  }

  const inboundError =
    validateIntegerRange("原文保留天数", input.inbound.retainRawDays, { min: 1, max: 3650 }) ||
    validateIntegerRange("附件大小 MB", input.inbound.maxAttachmentSizeMB, { min: 1, max: 1024 });
  if (inboundError) {
    return inboundError;
  }

  const apiLimitsError =
    validateSelection("API 身份桶策略", input.apiLimits.identityMode, ["ip", "bearer_or_ip"]) ||
    validateIntegerRange("匿名请求 RPM", input.apiLimits.anonymousRPM, { min: 1, max: 60000 }) ||
    validateIntegerRange("已认证请求 RPM", input.apiLimits.authenticatedRPM, { min: 1, max: 60000 }) ||
    validateIntegerRange("认证接口总 RPM", input.apiLimits.authRPM, { min: 1, max: 60000 }) ||
    validateIntegerRange("登录 RPM", input.apiLimits.loginRPM, { min: 1, max: 60000 }) ||
    validateIntegerRange("注册 RPM", input.apiLimits.registerRPM, { min: 1, max: 60000 }) ||
    validateIntegerRange("Refresh RPM", input.apiLimits.refreshRPM, { min: 1, max: 60000 }) ||
    validateIntegerRange("忘记密码 RPM", input.apiLimits.forgotPasswordRPM, { min: 1, max: 60000 }) ||
    validateIntegerRange("重置密码 RPM", input.apiLimits.resetPasswordRPM, { min: 1, max: 60000 }) ||
    validateIntegerRange("重发邮箱验证 RPM", input.apiLimits.emailVerificationResendRPM, { min: 1, max: 60000 }) ||
    validateIntegerRange("确认邮箱验证 RPM", input.apiLimits.emailVerificationConfirmRPM, { min: 1, max: 60000 }) ||
    validateIntegerRange("OAuth Start RPM", input.apiLimits.oauthStartRPM, { min: 1, max: 60000 }) ||
    validateIntegerRange("OAuth Callback RPM", input.apiLimits.oauthCallbackRPM, { min: 1, max: 60000 }) ||
    validateIntegerRange("2FA Verify RPM", input.apiLimits.login2faVerifyRPM, { min: 1, max: 60000 }) ||
    validateIntegerRange("邮箱写操作 RPM", input.apiLimits.mailboxWriteRPM, { min: 1, max: 60000 }) ||
    (input.apiLimits.strictIpEnabled
      ? validateIntegerRange("严格 IP RPM", input.apiLimits.strictIpRPM, { min: 1, max: 60000 })
      : null);
  if (apiLimitsError) {
    return apiLimitsError;
  }

  if (input.delivery.enabled) {
    const deliveryError =
      validateRequiredText("发信 SMTP Host", input.delivery.host, { minLength: 2, maxLength: 253 }) ||
      validateIntegerRange("发信端口", input.delivery.port, { min: 1, max: 65535 }) ||
      validateSelection("发信传输模式", input.delivery.transportMode, ["plain", "starttls", "smtps"]) ||
      validateRequiredText("发信账号", input.delivery.username, { minLength: 1, maxLength: 255 }) ||
      validateRequiredText("SMTP 密码 / App Password", input.delivery.password, { minLength: 1, maxLength: 255 }) ||
      validateEmailAddress(input.delivery.fromAddress) ||
      validateRequiredText("发件人名称", input.delivery.fromName, { minLength: 1, maxLength: 120 });
    if (deliveryError) {
      return deliveryError;
    }
  }

  for (const provider of input.oauthProviders) {
    const providerName = provider.displayName || provider.slug || "OAuth 应用";
    const providerError =
      validateRequiredText(`${providerName} 应用名称`, provider.displayName, { minLength: 2, maxLength: 80 }) ||
      validateRequiredText(`${providerName} Provider Slug`, provider.slug, { minLength: 2, maxLength: 64 });
    if (providerError) {
      return providerError;
    }
    if (provider.enabled) {
      const endpointError =
        validateRequiredText(`${providerName} Client ID`, provider.clientId, { minLength: 1, maxLength: 255 }) ||
        validateRequiredText(`${providerName} Client Secret`, provider.clientSecret, { minLength: 1, maxLength: 255 }) ||
        validateHTTPUrl(provider.authorizationUrl, `${providerName} Authorization URL`) ||
        validateHTTPUrl(provider.tokenUrl, `${providerName} Token URL`) ||
        validateHTTPUrl(provider.userInfoUrl, `${providerName} UserInfo URL`);
      if (endpointError) {
        return endpointError;
      }
      if (!provider.scopes.length) {
        return `${providerName} 至少需要一个 Scope。`;
      }
    }
  }

  return null;
}
