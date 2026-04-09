import type {
  AdminConfigItem,
  AuthPasswordSettings,
  AuthRegistrationSettings,
  AuthSessionSettings,
  APILimitsSettings,
  DomainPolicySettings,
  MailDeliverySettings,
  MailInboundSettings,
  MailSMTPSettings,
  OAuthDisplaySettings,
  OAuthProviderPreset,
  OAuthProviderSettings,
  SiteIdentitySettings,
} from "./types";

export const CONFIG_KEY_SITE_IDENTITY = "site.identity";
export const CONFIG_KEY_AUTH_REGISTRATION = "auth.registration_policy";
export const CONFIG_KEY_AUTH_PASSWORD = "auth.password_policy";
export const CONFIG_KEY_AUTH_SESSION = "auth.session_policy";
export const CONFIG_KEY_AUTH_OAUTH_DISPLAY = "auth.oauth.display";
export const CONFIG_KEY_AUTH_OAUTH_PROVIDER_PREFIX = "auth.oauth.providers.";
export const CONFIG_KEY_MAIL_SMTP = "mail.smtp";
export const CONFIG_KEY_MAIL_DELIVERY = "mail.delivery";
export const CONFIG_KEY_MAIL_INBOUND = "mail.inbound_policy";
export const CONFIG_KEY_API_LIMITS = "api.limits";
export const CONFIG_KEY_DOMAIN_POLICY = "domain.public_pool_policy";

export const defaultSiteIdentitySettings: SiteIdentitySettings = {
  siteName: "Shiro Email",
  slogan: "Enterprise temporary mail platform",
  supportEmail: "support@shiro.local",
  siteIconUrl: "",
  appBaseUrl: "http://localhost:5173",
  defaultLanguage: "zh-CN",
  defaultTimeZone: "Asia/Shanghai",
  ambientThemeEnabled: true,
  ambientThemeIntensity: "balanced",
};

export const defaultAuthRegistrationSettings: AuthRegistrationSettings = {
  registrationMode: "public",
  allowRegistration: true,
  requireEmailVerification: false,
  inviteOnly: false,
};

export const defaultAuthPasswordSettings: AuthPasswordSettings = {
  minLength: 8,
  requireUppercase: true,
  requireNumber: true,
  requireSpecial: false,
  passwordResetable: true,
};

export const defaultAuthSessionSettings: AuthSessionSettings = {
  accessTokenMinutes: 60,
  refreshTokenDays: 7,
  allowMultiSession: true,
  enableMFA: false,
  lockoutThreshold: 5,
  lockoutDurationMinutes: 30,
};

export const defaultOAuthDisplaySettings: OAuthDisplaySettings = {
  showOnLogin: true,
  providerOrder: [],
  autoLinkByEmail: true,
};

export const oauthProviderPresets: OAuthProviderPreset[] = [
  {
    slug: "google",
    displayName: "Google",
    authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    userInfoUrl: "https://openidconnect.googleapis.com/v1/userinfo",
    scopes: ["openid", "email", "profile"],
    usePkce: true,
  },
  {
    slug: "github",
    displayName: "GitHub",
    authorizationUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    userInfoUrl: "https://api.github.com/user",
    scopes: ["read:user", "user:email"],
    usePkce: true,
  },
  {
    slug: "microsoft",
    displayName: "Microsoft",
    authorizationUrl:
      "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    userInfoUrl: "https://graph.microsoft.com/oidc/userinfo",
    scopes: ["openid", "email", "profile"],
    usePkce: true,
  },
  {
    slug: "discord",
    displayName: "Discord",
    authorizationUrl: "https://discord.com/oauth2/authorize",
    tokenUrl: "https://discord.com/api/oauth2/token",
    userInfoUrl: "https://discord.com/api/users/@me",
    scopes: ["identify", "email"],
    usePkce: true,
  },
  {
    slug: "gitlab",
    displayName: "GitLab",
    authorizationUrl: "https://gitlab.com/oauth/authorize",
    tokenUrl: "https://gitlab.com/oauth/token",
    userInfoUrl: "https://gitlab.com/api/v4/user",
    scopes: ["read_user", "openid", "profile", "email"],
    usePkce: true,
  },
  {
    slug: "slack",
    displayName: "Slack",
    authorizationUrl: "https://slack.com/openid/connect/authorize",
    tokenUrl: "https://slack.com/api/openid.connect.token",
    userInfoUrl: "https://slack.com/api/openid.connect.userInfo",
    scopes: ["openid", "profile", "email"],
    usePkce: true,
  },
];

export function getOAuthProviderConfigKey(slug: string) {
  return `${CONFIG_KEY_AUTH_OAUTH_PROVIDER_PREFIX}${slug}`;
}

export function getOAuthCallbackURL(slug: string, origin?: string) {
  const base =
    origin && origin.length > 0
      ? origin.replace(/\/$/, "")
      : "http://localhost:5173";
  return `${base}/auth/callback/${slug}`;
}

export const defaultOAuthProviderSettings = (
  displayName: string,
  slug = displayName.toLowerCase(),
): OAuthProviderSettings => {
  const preset = oauthProviderPresets.find((item) => item.slug === slug);

  return {
    slug,
    enabled: false,
    clientId: "",
    clientSecret: "",
    redirectUrl: "",
    authorizationUrl: preset?.authorizationUrl ?? "",
    tokenUrl: preset?.tokenUrl ?? "",
    userInfoUrl: preset?.userInfoUrl ?? "",
    scopes: [...(preset?.scopes ?? [])],
    usePkce: preset?.usePkce ?? true,
    allowAutoRegister: true,
    allowLinkExisting: true,
    overwriteProfile: false,
    displayName: preset?.displayName ?? displayName,
  };
};

export const defaultMailSMTPSettings: MailSMTPSettings = {
  enabled: true,
  listenAddr: ":2525",
  hostname: "mail.shiro.local",
  dkimCnameTarget: "shiro._domainkey.shiro.local",
  maxMessageBytes: 10485760,
};

export const defaultMailDeliverySettings: MailDeliverySettings = {
  enabled: false,
  host: "",
  port: 587,
  username: "",
  password: "",
  fromAddress: "",
  fromName: "Shiro Email",
  transportMode: "starttls",
  insecureSkipVerify: false,
};

export const defaultMailInboundSettings: MailInboundSettings = {
  allowCatchAll: false,
  requireExistingMailbox: true,
  retainRawDays: 30,
  maxAttachmentSizeMB: 15,
  rejectExecutableFiles: true,
  enableSpamScanningPreview: false,
};

export const defaultAPILimitsSettings: APILimitsSettings = {
  enabled: true,
  identityMode: "bearer_or_ip",
  anonymousRPM: 120,
  authenticatedRPM: 600,
  authRPM: 10,
  loginRPM: 10,
  registerRPM: 10,
  refreshRPM: 30,
  forgotPasswordRPM: 10,
  resetPasswordRPM: 10,
  emailVerificationResendRPM: 10,
  emailVerificationConfirmRPM: 30,
  oauthStartRPM: 20,
  oauthCallbackRPM: 20,
  login2faVerifyRPM: 20,
  mailboxWriteRPM: 1200,
  strictIpEnabled: false,
  strictIpRPM: 1800,
};

export const defaultDomainPolicySettings: DomainPolicySettings = {
  requiresReview: true,
};

export function getConfigItem(
  items: AdminConfigItem[],
  key: string,
  fallback: Record<string, unknown>,
): AdminConfigItem {
  return (
    items.find((item) => item.key === key) ?? {
      key,
      value: fallback,
      updatedAt: "",
      updatedBy: 0,
    }
  );
}

export function readString(value: unknown, fallback: string) {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

export function readBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

export function readNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function readStringArray(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) {
    return [...fallback];
  }
  return value.filter(
    (item): item is string => typeof item === "string" && item.length > 0,
  );
}
