import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  Globe,
  KeyRound,
  Settings2,
  ShieldCheck,
  Users,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NoticeBanner } from "@/components/ui/notice-banner";
import {
  WorkspacePage,
  WorkspacePanel,
  WorkspaceBadge,
  WorkspaceListRow,
} from "@/components/layout/workspace-ui";
import {
  getAPIErrorMessage,
  getMailDeliveryDiagnostic,
  getMailDeliveryErrorMessage,
  type MailDeliveryDiagnosticPayload,
} from "@/lib/http";
import { validateEmailAddress, validateHTTPUrl, validateImageSourceUrl, validateIntegerRange, validateRequiredText, validateSelection } from "@/lib/validation";
import {
  deleteAdminConfig,
  fetchAdminAPILimitsSettings,
  fetchAdminSettingsSections,
  sendAdminMailDeliveryTest,
  upsertAdminConfig,
  type SettingsSection,
} from "../api";
import {
  CONFIG_KEY_AUTH_OAUTH_DISPLAY,
  CONFIG_KEY_AUTH_OAUTH_PROVIDER_PREFIX,
  CONFIG_KEY_AUTH_PASSWORD,
  CONFIG_KEY_AUTH_REGISTRATION,
  CONFIG_KEY_AUTH_SESSION,
  CONFIG_KEY_API_LIMITS,
  CONFIG_KEY_DOMAIN_POLICY,
  CONFIG_KEY_MAIL_DELIVERY,
  CONFIG_KEY_MAIL_INBOUND,
  CONFIG_KEY_MAIL_SMTP,
  CONFIG_KEY_SITE_IDENTITY,
  defaultAPILimitsSettings,
  defaultAuthPasswordSettings,
  defaultAuthRegistrationSettings,
  defaultAuthSessionSettings,
  defaultDomainPolicySettings,
  defaultMailInboundSettings,
  defaultMailDeliverySettings,
  defaultMailSMTPSettings,
  defaultOAuthDisplaySettings,
  defaultOAuthProviderSettings,
  getOAuthProviderConfigKey,
  defaultSiteIdentitySettings,
  getConfigItem,
  readBoolean,
  readNumber,
  readString,
  readStringArray,
} from "../settings/defaults";
import { AuthSettingsForm } from "../settings/auth-settings-form";
import { APISettingsForm } from "../settings/api-settings-form";
import { DomainPolicyForm } from "../settings/domain-policy-form";
import { MailSettingsForm } from "../settings/mail-settings-form";
import { SiteSettingsForm } from "../settings/site-settings-form";
import {
  deriveMailTargetsFromAppBaseURL,
  shouldReplaceWithDerivedMailTarget,
} from "../settings/mail-domain-defaults";
import type {
  AuthPasswordSettings,
  AuthRegistrationSettings,
  AuthSessionSettings,
  APILimitsSettings,
  DomainPolicySettings,
  MailInboundSettings,
  MailDeliverySettings,
  MailSMTPSettings,
  OAuthDisplaySettings,
  OAuthProviderSettings,
  SiteIdentitySettings,
} from "../settings/types";
import { formatDateTime } from "../../user/pages/shared";

type DeliveryTestDiagnosticState = {
  status: "idle" | "success" | "error";
  recipient: string;
  testedAt?: string;
  message?: string;
  diagnostic?: MailDeliveryDiagnosticPayload;
};

function flattenSectionItems(sections: SettingsSection[]) {
  return sections.flatMap((section) => section.items);
}

function parseSiteIdentity(sections: SettingsSection[]): SiteIdentitySettings {
  const item = getConfigItem(
    flattenSectionItems(sections),
    CONFIG_KEY_SITE_IDENTITY,
    defaultSiteIdentitySettings,
  );
  return {
    siteName: readString(
      item.value.siteName,
      defaultSiteIdentitySettings.siteName,
    ),
    slogan: readString(item.value.slogan, defaultSiteIdentitySettings.slogan),
    supportEmail: readString(
      item.value.supportEmail,
      defaultSiteIdentitySettings.supportEmail,
    ),
    siteIconUrl: readString(
      item.value.siteIconUrl,
      defaultSiteIdentitySettings.siteIconUrl,
    ),
    appBaseUrl: readString(
      item.value.appBaseUrl,
      defaultSiteIdentitySettings.appBaseUrl,
    ),
    defaultLanguage: readString(
      item.value.defaultLanguage,
      defaultSiteIdentitySettings.defaultLanguage,
    ),
    defaultTimeZone: readString(
      item.value.defaultTimeZone,
      defaultSiteIdentitySettings.defaultTimeZone,
    ),
    ambientThemeEnabled: readBoolean(
      item.value.ambientThemeEnabled,
      defaultSiteIdentitySettings.ambientThemeEnabled,
    ),
    ambientThemeIntensity: readString(
      item.value.ambientThemeIntensity,
      defaultSiteIdentitySettings.ambientThemeIntensity,
    ),
  };
}

function parseRegistration(
  sections: SettingsSection[],
): AuthRegistrationSettings {
  const item = getConfigItem(
    flattenSectionItems(sections),
    CONFIG_KEY_AUTH_REGISTRATION,
    defaultAuthRegistrationSettings,
  );
  return {
    registrationMode: readString(
      item.value.registrationMode,
      defaultAuthRegistrationSettings.registrationMode,
    ),
    allowRegistration: readBoolean(
      item.value.allowRegistration,
      defaultAuthRegistrationSettings.allowRegistration,
    ),
    requireEmailVerification: readBoolean(
      item.value.requireEmailVerification,
      defaultAuthRegistrationSettings.requireEmailVerification,
    ),
    inviteOnly: readBoolean(
      item.value.inviteOnly,
      defaultAuthRegistrationSettings.inviteOnly,
    ),
  };
}

function parsePassword(sections: SettingsSection[]): AuthPasswordSettings {
  const item = getConfigItem(
    flattenSectionItems(sections),
    CONFIG_KEY_AUTH_PASSWORD,
    defaultAuthPasswordSettings,
  );
  return {
    minLength: readNumber(
      item.value.minLength,
      defaultAuthPasswordSettings.minLength,
    ),
    requireUppercase: readBoolean(
      item.value.requireUppercase,
      defaultAuthPasswordSettings.requireUppercase,
    ),
    requireNumber: readBoolean(
      item.value.requireNumber,
      defaultAuthPasswordSettings.requireNumber,
    ),
    requireSpecial: readBoolean(
      item.value.requireSpecial,
      defaultAuthPasswordSettings.requireSpecial,
    ),
    passwordResetable: readBoolean(
      item.value.passwordResetable,
      defaultAuthPasswordSettings.passwordResetable,
    ),
  };
}

function parseSession(sections: SettingsSection[]): AuthSessionSettings {
  const item = getConfigItem(
    flattenSectionItems(sections),
    CONFIG_KEY_AUTH_SESSION,
    defaultAuthSessionSettings,
  );
  return {
    accessTokenMinutes: readNumber(
      item.value.accessTokenMinutes,
      defaultAuthSessionSettings.accessTokenMinutes,
    ),
    refreshTokenDays: readNumber(
      item.value.refreshTokenDays,
      defaultAuthSessionSettings.refreshTokenDays,
    ),
    allowMultiSession: readBoolean(
      item.value.allowMultiSession,
      defaultAuthSessionSettings.allowMultiSession,
    ),
    enableMFA: readBoolean(
      item.value.enableMFA,
      defaultAuthSessionSettings.enableMFA,
    ),
    lockoutThreshold: readNumber(
      item.value.lockoutThreshold,
      defaultAuthSessionSettings.lockoutThreshold,
    ),
    lockoutDurationMinutes: readNumber(
      item.value.lockoutDurationMinutes,
      defaultAuthSessionSettings.lockoutDurationMinutes,
    ),
  };
}

function parseOAuthDisplay(sections: SettingsSection[]): OAuthDisplaySettings {
  const item = getConfigItem(
    flattenSectionItems(sections),
    CONFIG_KEY_AUTH_OAUTH_DISPLAY,
    defaultOAuthDisplaySettings,
  );
  return {
    showOnLogin: readBoolean(
      item.value.showOnLogin,
      defaultOAuthDisplaySettings.showOnLogin,
    ),
    providerOrder: readStringArray(
      item.value.providerOrder,
      defaultOAuthDisplaySettings.providerOrder,
    ),
    autoLinkByEmail: readBoolean(
      item.value.autoLinkByEmail,
      defaultOAuthDisplaySettings.autoLinkByEmail,
    ),
  };
}

function parseProvider(
  value: Record<string, unknown>,
  slug: string,
  displayName: string,
): OAuthProviderSettings {
  const defaults = defaultOAuthProviderSettings(displayName, slug);
  return {
    slug,
    enabled: readBoolean(value.enabled, defaults.enabled),
    clientId: readString(value.clientId, defaults.clientId),
    clientSecret: readString(value.clientSecret, defaults.clientSecret),
    redirectUrl: readString(value.redirectUrl, defaults.redirectUrl),
    authorizationUrl: readString(
      value.authorizationUrl,
      defaults.authorizationUrl,
    ),
    tokenUrl: readString(value.tokenUrl, defaults.tokenUrl),
    userInfoUrl: readString(value.userInfoUrl, defaults.userInfoUrl),
    scopes: readStringArray(value.scopes, defaults.scopes),
    usePkce: readBoolean(value.usePkce, defaults.usePkce),
    allowAutoRegister: readBoolean(
      value.allowAutoRegister,
      defaults.allowAutoRegister,
    ),
    allowLinkExisting: readBoolean(
      value.allowLinkExisting,
      defaults.allowLinkExisting,
    ),
    overwriteProfile: readBoolean(
      value.overwriteProfile,
      defaults.overwriteProfile,
    ),
    displayName: readString(value.displayName, defaults.displayName),
  };
}

function parseOAuthProviders(sections: SettingsSection[]) {
  const items = flattenSectionItems(sections).filter((item) =>
    item.key.startsWith(CONFIG_KEY_AUTH_OAUTH_PROVIDER_PREFIX),
  );

  return items
    .map((item) => {
      const slug = item.key.slice(CONFIG_KEY_AUTH_OAUTH_PROVIDER_PREFIX.length);
      const displayName = readString(item.value.displayName, slug);
      return parseProvider(item.value, slug, displayName);
    })
    .sort((left, right) => left.displayName.localeCompare(right.displayName));
}

function parseSMTP(sections: SettingsSection[]): MailSMTPSettings {
  const item = getConfigItem(
    flattenSectionItems(sections),
    CONFIG_KEY_MAIL_SMTP,
    defaultMailSMTPSettings,
  );
  return {
    enabled: readBoolean(item.value.enabled, defaultMailSMTPSettings.enabled),
    listenAddr: readString(
      item.value.listenAddr,
      defaultMailSMTPSettings.listenAddr,
    ),
    hostname: readString(item.value.hostname, defaultMailSMTPSettings.hostname),
    dkimCnameTarget: readString(
      item.value.dkimCnameTarget,
      defaultMailSMTPSettings.dkimCnameTarget,
    ),
    maxMessageBytes: readNumber(
      item.value.maxMessageBytes,
      defaultMailSMTPSettings.maxMessageBytes,
    ),
  };
}

function parseMailDelivery(sections: SettingsSection[]): MailDeliverySettings {
  const item = getConfigItem(
    flattenSectionItems(sections),
    CONFIG_KEY_MAIL_DELIVERY,
    defaultMailDeliverySettings,
  );
  return {
    enabled: readBoolean(item.value.enabled, defaultMailDeliverySettings.enabled),
    host: readString(item.value.host, defaultMailDeliverySettings.host),
    port: readNumber(item.value.port, defaultMailDeliverySettings.port),
    username: readString(item.value.username, defaultMailDeliverySettings.username),
    password: readString(item.value.password, defaultMailDeliverySettings.password),
    fromAddress: readString(item.value.fromAddress, defaultMailDeliverySettings.fromAddress),
    fromName: readString(item.value.fromName, defaultMailDeliverySettings.fromName),
    transportMode: readString(item.value.transportMode, defaultMailDeliverySettings.transportMode),
    insecureSkipVerify: readBoolean(
      item.value.insecureSkipVerify,
      defaultMailDeliverySettings.insecureSkipVerify,
    ),
  };
}

function parseInbound(sections: SettingsSection[]): MailInboundSettings {
  const item = getConfigItem(
    flattenSectionItems(sections),
    CONFIG_KEY_MAIL_INBOUND,
    defaultMailInboundSettings,
  );
  return {
    allowCatchAll: readBoolean(
      item.value.allowCatchAll,
      defaultMailInboundSettings.allowCatchAll,
    ),
    requireExistingMailbox: readBoolean(
      item.value.requireExistingMailbox,
      defaultMailInboundSettings.requireExistingMailbox,
    ),
    retainRawDays: readNumber(
      item.value.retainRawDays,
      defaultMailInboundSettings.retainRawDays,
    ),
    maxAttachmentSizeMB: readNumber(
      item.value.maxAttachmentSizeMB,
      defaultMailInboundSettings.maxAttachmentSizeMB,
    ),
    rejectExecutableFiles: readBoolean(
      item.value.rejectExecutableFiles,
      defaultMailInboundSettings.rejectExecutableFiles,
    ),
    enableSpamScanningPreview: readBoolean(
      item.value.enableSpamScanningPreview,
      defaultMailInboundSettings.enableSpamScanningPreview,
    ),
  };
}

function parseDomainPolicy(sections: SettingsSection[]): DomainPolicySettings {
  const item = getConfigItem(
    flattenSectionItems(sections),
    CONFIG_KEY_DOMAIN_POLICY,
    defaultDomainPolicySettings,
  );
  return {
    requiresReview: readBoolean(
      item.value.requiresReview,
      defaultDomainPolicySettings.requiresReview,
    ),
  };
}

function parseAPILimits(sections: SettingsSection[]): APILimitsSettings {
  const item = getConfigItem(
    flattenSectionItems(sections),
    CONFIG_KEY_API_LIMITS,
    defaultAPILimitsSettings,
  );
  return {
    enabled: readBoolean(item.value.enabled, defaultAPILimitsSettings.enabled),
    identityMode: readString(
      item.value.identityMode,
      defaultAPILimitsSettings.identityMode,
    ),
    anonymousRPM: readNumber(
      item.value.anonymousRPM,
      defaultAPILimitsSettings.anonymousRPM,
    ),
    authenticatedRPM: readNumber(
      item.value.authenticatedRPM,
      defaultAPILimitsSettings.authenticatedRPM,
    ),
    authRPM: readNumber(item.value.authRPM, defaultAPILimitsSettings.authRPM),
    loginRPM: readNumber(
      item.value.loginRPM,
      defaultAPILimitsSettings.loginRPM,
    ),
    registerRPM: readNumber(
      item.value.registerRPM,
      defaultAPILimitsSettings.registerRPM,
    ),
    refreshRPM: readNumber(
      item.value.refreshRPM,
      defaultAPILimitsSettings.refreshRPM,
    ),
    forgotPasswordRPM: readNumber(
      item.value.forgotPasswordRPM,
      defaultAPILimitsSettings.forgotPasswordRPM,
    ),
    resetPasswordRPM: readNumber(
      item.value.resetPasswordRPM,
      defaultAPILimitsSettings.resetPasswordRPM,
    ),
    emailVerificationResendRPM: readNumber(
      item.value.emailVerificationResendRPM,
      defaultAPILimitsSettings.emailVerificationResendRPM,
    ),
    emailVerificationConfirmRPM: readNumber(
      item.value.emailVerificationConfirmRPM,
      defaultAPILimitsSettings.emailVerificationConfirmRPM,
    ),
    oauthStartRPM: readNumber(
      item.value.oauthStartRPM,
      defaultAPILimitsSettings.oauthStartRPM,
    ),
    oauthCallbackRPM: readNumber(
      item.value.oauthCallbackRPM,
      defaultAPILimitsSettings.oauthCallbackRPM,
    ),
    login2faVerifyRPM: readNumber(
      item.value.login2faVerifyRPM,
      defaultAPILimitsSettings.login2faVerifyRPM,
    ),
    mailboxWriteRPM: readNumber(
      item.value.mailboxWriteRPM,
      defaultAPILimitsSettings.mailboxWriteRPM,
    ),
    strictIpEnabled: readBoolean(
      item.value.strictIpEnabled,
      defaultAPILimitsSettings.strictIpEnabled,
    ),
    strictIpRPM: readNumber(
      item.value.strictIpRPM,
      defaultAPILimitsSettings.strictIpRPM,
    ),
  };
}

function validateAdminSettingsSnapshot(input: {
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
      ? validateIntegerRange("严格 IP RPM", input.apiLimits.strictIpRPM, {
          min: 1,
          max: 60000,
        })
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

export function AdminSettingsPage() {
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({
    queryKey: ["admin-settings-sections"],
    queryFn: fetchAdminSettingsSections,
  });
  const apiLimitsRuntimeQuery = useQuery({
    queryKey: ["admin-api-limits-settings"],
    queryFn: fetchAdminAPILimitsSettings,
  });

  const [siteIdentity, setSiteIdentity] = useState<SiteIdentitySettings>(
    defaultSiteIdentitySettings,
  );
  const [registration, setRegistration] = useState<AuthRegistrationSettings>(
    defaultAuthRegistrationSettings,
  );
  const [password, setPassword] = useState<AuthPasswordSettings>(
    defaultAuthPasswordSettings,
  );
  const [session, setSession] = useState<AuthSessionSettings>(
    defaultAuthSessionSettings,
  );
  const [oauthDisplay, setOAuthDisplay] = useState<OAuthDisplaySettings>(
    defaultOAuthDisplaySettings,
  );
  const [oauthProviders, setOAuthProviders] = useState<OAuthProviderSettings[]>([]);
  const [smtp, setSMTP] = useState<MailSMTPSettings>(defaultMailSMTPSettings);
  const [delivery, setDelivery] = useState<MailDeliverySettings>(
    defaultMailDeliverySettings,
  );
  const [deliveryTestRecipient, setDeliveryTestRecipient] = useState("");
  const [inbound, setInbound] = useState<MailInboundSettings>(
    defaultMailInboundSettings,
  );
  const [apiLimits, setAPILimits] = useState<APILimitsSettings>(
    defaultAPILimitsSettings,
  );
  const [domainPolicy, setDomainPolicy] = useState<DomainPolicySettings>(
    defaultDomainPolicySettings,
  );
  const derivedMailTargets = useMemo(
    () => deriveMailTargetsFromAppBaseURL(siteIdentity.appBaseUrl),
    [siteIdentity.appBaseUrl],
  );
  const previousDerivedMailTargetsRef = useRef(derivedMailTargets);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [feedbackVariant, setFeedbackVariant] = useState<"error" | "success">("success");
  const [deliveryTestDiagnostic, setDeliveryTestDiagnostic] = useState<DeliveryTestDiagnosticState>({
    status: "idle",
    recipient: "",
  });
  const deliveryTestLockRef = useRef(false);

  useEffect(() => {
    if (!settingsQuery.data) {
      return;
    }

    setSiteIdentity(parseSiteIdentity(settingsQuery.data));
    setRegistration(parseRegistration(settingsQuery.data));
    setPassword(parsePassword(settingsQuery.data));
    setSession(parseSession(settingsQuery.data));
    setOAuthDisplay(parseOAuthDisplay(settingsQuery.data));
    setOAuthProviders(parseOAuthProviders(settingsQuery.data));
    setSMTP(parseSMTP(settingsQuery.data));
    const nextDelivery = parseMailDelivery(settingsQuery.data);
    setDelivery(nextDelivery);
    setDeliveryTestRecipient(nextDelivery.fromAddress);
    setInbound(parseInbound(settingsQuery.data));
    setAPILimits(parseAPILimits(settingsQuery.data));
    setDomainPolicy(parseDomainPolicy(settingsQuery.data));
  }, [settingsQuery.data]);

  useEffect(() => {
    const previousDerivedTargets = previousDerivedMailTargetsRef.current;
    previousDerivedMailTargetsRef.current = derivedMailTargets;

    if (!derivedMailTargets) {
      return;
    }

    setSMTP((current) => {
      const next = { ...current };
      let changed = false;

      if (shouldReplaceWithDerivedMailTarget(current.hostname, previousDerivedTargets?.hostname)) {
        if (current.hostname !== derivedMailTargets.hostname) {
          next.hostname = derivedMailTargets.hostname;
          changed = true;
        }
      }

      if (shouldReplaceWithDerivedMailTarget(current.dkimCnameTarget, previousDerivedTargets?.dkimCnameTarget)) {
        if (current.dkimCnameTarget !== derivedMailTargets.dkimCnameTarget) {
          next.dkimCnameTarget = derivedMailTargets.dkimCnameTarget;
          changed = true;
        }
      }

      return changed ? next : current;
    });
  }, [derivedMailTargets]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const providerKeys = flattenSectionItems(settingsQuery.data ?? [])
        .filter((item) => item.key.startsWith(CONFIG_KEY_AUTH_OAUTH_PROVIDER_PREFIX))
        .map((item) => item.key);
      const nextProviderKeys = oauthProviders.map((item) =>
        getOAuthProviderConfigKey(item.slug),
      );
      const staleProviderKeys = providerKeys.filter(
        (key) => !nextProviderKeys.includes(key),
      );

      await Promise.all([
        upsertAdminConfig(CONFIG_KEY_SITE_IDENTITY, siteIdentity),
        upsertAdminConfig(CONFIG_KEY_AUTH_REGISTRATION, registration),
        upsertAdminConfig(CONFIG_KEY_AUTH_PASSWORD, password),
        upsertAdminConfig(CONFIG_KEY_AUTH_SESSION, session),
        upsertAdminConfig(CONFIG_KEY_AUTH_OAUTH_DISPLAY, oauthDisplay),
        upsertAdminConfig(CONFIG_KEY_MAIL_SMTP, smtp),
        upsertAdminConfig(CONFIG_KEY_MAIL_DELIVERY, delivery),
        upsertAdminConfig(CONFIG_KEY_MAIL_INBOUND, inbound),
        upsertAdminConfig(CONFIG_KEY_API_LIMITS, apiLimits),
        upsertAdminConfig(CONFIG_KEY_DOMAIN_POLICY, domainPolicy),
        ...oauthProviders.map((provider) =>
          upsertAdminConfig(getOAuthProviderConfigKey(provider.slug), provider),
        ),
        ...staleProviderKeys.map((key) => deleteAdminConfig(key)),
      ]);
    },
    onSuccess: async () => {
      setFeedbackVariant("success");
      setFeedback("系统设置已保存。");
      await queryClient.invalidateQueries({
        queryKey: ["admin-settings-sections"],
      });
      await queryClient.invalidateQueries({
        queryKey: ["admin-api-limits-settings"],
      });
      window.setTimeout(() => setFeedback(null), 5000);
    },
    onError: (error) => {
      setFeedbackVariant("error");
      setFeedback(getAPIErrorMessage(error, "系统设置保存失败，请稍后重试。"));
      window.setTimeout(() => setFeedback(null), 5000);
    },
  });

  const testDeliveryMutation = useMutation({
    mutationFn: async () =>
      sendAdminMailDeliveryTest({
        to: deliveryTestRecipient.trim() || delivery.fromAddress,
      }),
    onSuccess: (result) => {
      const testedAt = new Date().toISOString();
      setDeliveryTestDiagnostic({
        status: "success",
        recipient: result.recipient,
        testedAt,
        message: `测试邮件已提交到 ${result.recipient}。`,
      });
      setFeedbackVariant("success");
      setFeedback(`测试邮件已发送至 ${result.recipient}。`);
      window.setTimeout(() => setFeedback(null), 5000);
    },
    onError: (error) => {
      const recipient = deliveryTestRecipient.trim() || delivery.fromAddress;
      const diagnostic = getMailDeliveryDiagnostic(error);
      setDeliveryTestDiagnostic({
        status: "error",
        recipient,
        testedAt: new Date().toISOString(),
        diagnostic: diagnostic ?? undefined,
        message: getMailDeliveryErrorMessage(
          error,
          "测试邮件发送失败，请检查 SMTP 配置后重试。",
        ),
      });
      setFeedbackVariant("error");
      setFeedback(
        getMailDeliveryErrorMessage(
          error,
          "测试邮件发送失败，请检查 SMTP 配置后重试。",
        ),
      );
      window.setTimeout(() => setFeedback(null), 5000);
    },
  });

  const loadingText = useMemo(() => {
    if (settingsQuery.isLoading) {
      return "正在加载系统设置...";
    }
    if (saveMutation.isPending) {
      return "正在保存系统设置...";
    }
    return null;
  }, [saveMutation.isPending, settingsQuery.isLoading]);

  function handleSaveSettings() {
    const validationError = validateAdminSettingsSnapshot({
      siteIdentity,
      registration,
      password,
      session,
      smtp,
      delivery,
      inbound,
      apiLimits,
      oauthProviders,
    });
    if (validationError) {
      setFeedbackVariant("error");
      setFeedback(validationError);
      window.setTimeout(() => setFeedback(null), 5000);
      return;
    }
    saveMutation.mutate();
  }

  function handleSendDeliveryTest() {
    if (deliveryTestLockRef.current || testDeliveryMutation.isPending) {
      return;
    }
    const recipient = deliveryTestRecipient.trim() || delivery.fromAddress;
    const recipientError = validateEmailAddress(recipient);
    if (recipientError) {
      setFeedbackVariant("error");
      setFeedback(recipientError);
      window.setTimeout(() => setFeedback(null), 5000);
      return;
    }
    deliveryTestLockRef.current = true;
    testDeliveryMutation.mutate(undefined, {
      onSettled: () => {
        deliveryTestLockRef.current = false;
      },
    });
  }

  return (
    <WorkspacePage>
      <WorkspacePanel
        title="系统设置"
        description="按站点、OAuth、用户策略和其他系统项分组管理，避免整页长表单堆叠。"
        action={
          <Button
            disabled={saveMutation.isPending || settingsQuery.isLoading}
            onClick={handleSaveSettings}
          >
            {saveMutation.isPending ? "保存中..." : "保存设置"}
          </Button>
        }
      >
        <div className="space-y-4">
          {loadingText ? (
            <div className="text-sm text-muted-foreground">{loadingText}</div>
          ) : null}
          {feedback ? (
            <NoticeBanner onDismiss={() => setFeedback(null)} variant={feedbackVariant}>
              {feedback}
            </NoticeBanner>
          ) : null}
        </div>
      </WorkspacePanel>

      <Tabs defaultValue="site" className="gap-4">
        <WorkspacePanel
          title="设置分组"
          description="先选分类，再编辑对应配置；保存按钮仍然一次性提交全部当前设置。"
        >
          <TabsList className="h-auto w-full flex-wrap justify-start gap-2 rounded-2xl bg-muted/40 p-1.5">
            <TabsTrigger className="h-10 flex-none px-3.5" value="site">
              <Globe className="size-4" />
              网站设置
            </TabsTrigger>
            <TabsTrigger className="h-10 flex-none px-3.5" value="oauth">
              <KeyRound className="size-4" />
              OAuth 设置
            </TabsTrigger>
            <TabsTrigger className="h-10 flex-none px-3.5" value="users">
              <Users className="size-4" />
              用户设置
            </TabsTrigger>
            <TabsTrigger className="h-10 flex-none px-3.5" value="api">
              <Activity className="size-4" />
              API 设置
            </TabsTrigger>
            <TabsTrigger className="h-10 flex-none px-3.5" value="other">
              <Settings2 className="size-4" />
              其他设置
            </TabsTrigger>
          </TabsList>
        </WorkspacePanel>

        <TabsContent value="site">
          <WorkspacePanel
            title="网站设置"
            description="维护站点名称、支持邮箱、默认语言与时区等基础站点信息。"
          >
            <SiteSettingsForm
              identity={siteIdentity}
              onIdentityChange={setSiteIdentity}
            />
          </WorkspacePanel>
        </TabsContent>

        <TabsContent value="oauth">
          <WorkspacePanel
            title="OAuth 设置"
            description="管理登录页展示、OAuth 2.1 / PKCE provider 端点与客户端凭据。"
          >
            <AuthSettingsForm
              registration={registration}
              password={password}
              session={session}
              oauthDisplay={oauthDisplay}
              providers={oauthProviders}
              onRegistrationChange={setRegistration}
              onPasswordChange={setPassword}
              onSessionChange={setSession}
              onOAuthDisplayChange={setOAuthDisplay}
              onProvidersChange={setOAuthProviders}
              mode="oauth"
            />
          </WorkspacePanel>
        </TabsContent>

        <TabsContent value="users">
          <WorkspacePanel
            title="用户设置"
            description="控制注册开放、密码规则、会话策略与用户侧认证约束。"
          >
            <AuthSettingsForm
              registration={registration}
              password={password}
              session={session}
              oauthDisplay={oauthDisplay}
              providers={oauthProviders}
              onRegistrationChange={setRegistration}
              onPasswordChange={setPassword}
              onSessionChange={setSession}
              onOAuthDisplayChange={setOAuthDisplay}
              onProvidersChange={setOAuthProviders}
              mode="user"
            />
          </WorkspacePanel>
        </TabsContent>

        <TabsContent value="api">
          <WorkspacePanel
            title="API 设置"
            description="细分匿名、已认证、登录注册与邮箱写操作限流，并支持严格 IP 桶。"
          >
            <div className="mb-4 grid gap-3 lg:grid-cols-4">
              <div className="rounded-2xl border border-border/60 bg-muted/20 p-4">
                <div className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                  Runtime Status
                </div>
                <div className="mt-2 text-base font-semibold text-foreground">
                  {apiLimitsRuntimeQuery.data?.enabled ? "Rate limit enabled" : "Rate limit disabled"}
                </div>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  当前后端读取到的主限流状态。保存后这里会随着轮询刷新自动更新。
                </p>
              </div>
              <div className="rounded-2xl border border-border/60 bg-muted/20 p-4">
                <div className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                  Identity Mode
                </div>
                <div className="mt-2 text-base font-semibold text-foreground">
                  {apiLimitsRuntimeQuery.data?.identityMode === "ip" ? "IP only" : "Bearer / IP mixed"}
                </div>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  匿名流量走 IP 桶；已认证流量根据当前策略决定是否按 Bearer Token 分桶。
                </p>
              </div>
              <div className="rounded-2xl border border-border/60 bg-muted/20 p-4">
                <div className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                  Main RPM
                </div>
                <div className="mt-2 text-base font-semibold text-foreground">
                  {apiLimitsRuntimeQuery.data
                    ? `${apiLimitsRuntimeQuery.data.anonymousRPM} / ${apiLimitsRuntimeQuery.data.authenticatedRPM}`
                    : "-- / --"}
                </div>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  左侧是匿名请求每分钟上限，右侧是已认证请求每分钟上限。
                </p>
              </div>
              <div className="rounded-2xl border border-border/60 bg-muted/20 p-4">
                <div className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                  Strict IP
                </div>
                <div className="mt-2 text-base font-semibold text-foreground">
                  {apiLimitsRuntimeQuery.data?.strictIpEnabled
                    ? `${apiLimitsRuntimeQuery.data.strictIpRPM} RPM`
                    : "Disabled"}
                </div>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  作为第二层兜底桶，适合限制共享代理、出口合并或单源高频打点。
                </p>
              </div>
            </div>
            <APISettingsForm value={apiLimits} onChange={setAPILimits} />
          </WorkspacePanel>
        </TabsContent>

        <TabsContent value="other">
          <div className="grid gap-4">
            <WorkspacePanel
              title="邮件基础设施"
              description="管理 SMTP 监听地址、邮件主机名与基础收件开关。"
            >
              <MailSettingsForm
                smtp={smtp}
                delivery={delivery}
                inbound={inbound}
                onSMTPChange={setSMTP}
                onDeliveryChange={setDelivery}
                onInboundChange={setInbound}
                mode="smtp"
              />
            </WorkspacePanel>

            <WorkspacePanel
              title="账户邮件发信"
              description="配置注册验证、找回密码与账户通知发信 SMTP。"
            >
              <MailSettingsForm
                smtp={smtp}
                delivery={delivery}
                inbound={inbound}
                onSMTPChange={setSMTP}
                onDeliveryChange={setDelivery}
                onInboundChange={setInbound}
                mode="delivery"
              />
              <div className="mt-4 flex flex-col gap-3 rounded-xl border border-border/60 bg-muted/20 p-3 md:flex-row md:items-end">
                <div className="flex-1 space-y-2">
                  <div className="text-sm font-medium">测试收件邮箱</div>
                  <Input
                    aria-label="测试收件邮箱"
                    placeholder="默认使用发件邮箱"
                    value={deliveryTestRecipient}
                    onChange={(event) =>
                      setDeliveryTestRecipient(event.target.value)
                    }
                  />
                </div>
                <Button
                  disabled={testDeliveryMutation.isPending}
                  onClick={handleSendDeliveryTest}
                >
                  {testDeliveryMutation.isPending ? "发送中..." : "发送测试邮件"}
                </Button>
              </div>
              {deliveryTestDiagnostic.status !== "idle" ? (
                <div className="mt-4 rounded-xl border border-border/60 bg-card/70 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-sm font-medium">最近一次 SMTP 测试</div>
                    <WorkspaceBadge
                      variant={
                        deliveryTestDiagnostic.status === "success"
                          ? "outline"
                          : "destructive"
                      }
                    >
                      {deliveryTestDiagnostic.status === "success"
                        ? "Success"
                        : "Failed"}
                    </WorkspaceBadge>
                    {deliveryTestDiagnostic.diagnostic?.code ? (
                      <WorkspaceBadge variant="secondary">
                        {deliveryTestDiagnostic.diagnostic.code}
                      </WorkspaceBadge>
                    ) : null}
                    {typeof deliveryTestDiagnostic.diagnostic?.retryable === "boolean" ? (
                      <WorkspaceBadge
                        variant={
                          deliveryTestDiagnostic.diagnostic.retryable
                            ? "outline"
                            : "secondary"
                        }
                      >
                        {deliveryTestDiagnostic.diagnostic.retryable
                          ? "Retryable"
                          : "Check config"}
                      </WorkspaceBadge>
                    ) : null}
                  </div>
                  <div className="mt-3 space-y-3">
                    <WorkspaceListRow
                      title={deliveryTestDiagnostic.message ?? "暂无诊断信息"}
                      description={
                        deliveryTestDiagnostic.diagnostic?.hint ??
                        (deliveryTestDiagnostic.status === "success"
                          ? "如果未收到邮件，请再检查上游 SMTP 日志、垃圾箱或延迟投递情况。"
                          : "后端未返回结构化诊断时，会自动回退到原始错误信息。")
                      }
                      meta={
                        <>
                          <WorkspaceBadge variant="outline">
                            {deliveryTestDiagnostic.recipient || "未指定收件人"}
                          </WorkspaceBadge>
                          {deliveryTestDiagnostic.diagnostic?.stage ? (
                            <WorkspaceBadge variant="secondary">
                              stage: {deliveryTestDiagnostic.diagnostic.stage}
                            </WorkspaceBadge>
                          ) : null}
                          {deliveryTestDiagnostic.testedAt ? (
                            <span>{formatDateTime(deliveryTestDiagnostic.testedAt)}</span>
                          ) : null}
                        </>
                      }
                      titleClassName="whitespace-normal"
                      descriptionClassName="whitespace-normal"
                    />
                  </div>
                </div>
              ) : null}
            </WorkspacePanel>

            <WorkspacePanel
              title="入站策略"
              description="控制 raw 保留、附件大小、catch-all 与入站收件限制。"
            >
              <MailSettingsForm
                smtp={smtp}
                delivery={delivery}
                inbound={inbound}
                onSMTPChange={setSMTP}
                onDeliveryChange={setDelivery}
                onInboundChange={setInbound}
                mode="inbound"
              />
            </WorkspacePanel>

            <WorkspacePanel
              title="平台治理"
              description="整站级公开域审核与后续平台风控策略。"
            >
              <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                <ShieldCheck className="size-4 text-muted-foreground" />
                域名平台策略
              </div>
              <DomainPolicyForm
                value={domainPolicy}
                onChange={setDomainPolicy}
              />
            </WorkspacePanel>
          </div>
        </TabsContent>
      </Tabs>
    </WorkspacePage>
  );
}
