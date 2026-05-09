import type { SettingsSection } from "../api";
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
  defaultSiteIdentitySettings,
  getConfigItem,
  readBoolean,
  readNumber,
  readString,
  readStringArray,
} from "../settings/defaults";
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

export function flattenSectionItems(sections: SettingsSection[]) {
  return sections.flatMap((section) => section.items);
}

export function parseSiteIdentity(sections: SettingsSection[]): SiteIdentitySettings {
  const item = getConfigItem(
    flattenSectionItems(sections),
    CONFIG_KEY_SITE_IDENTITY,
    defaultSiteIdentitySettings,
  );
  return {
    siteName: readString(item.value.siteName, defaultSiteIdentitySettings.siteName),
    slogan: readString(item.value.slogan, defaultSiteIdentitySettings.slogan),
    supportEmail: readString(item.value.supportEmail, defaultSiteIdentitySettings.supportEmail),
    siteIconUrl: readString(item.value.siteIconUrl, defaultSiteIdentitySettings.siteIconUrl),
    appBaseUrl: readString(item.value.appBaseUrl, defaultSiteIdentitySettings.appBaseUrl),
    defaultLanguage: readString(item.value.defaultLanguage, defaultSiteIdentitySettings.defaultLanguage),
    defaultTimeZone: readString(item.value.defaultTimeZone, defaultSiteIdentitySettings.defaultTimeZone),
    ambientThemeEnabled: readBoolean(item.value.ambientThemeEnabled, defaultSiteIdentitySettings.ambientThemeEnabled),
    ambientThemeIntensity: readString(item.value.ambientThemeIntensity, defaultSiteIdentitySettings.ambientThemeIntensity),
  };
}

export function parseRegistration(sections: SettingsSection[]): AuthRegistrationSettings {
  const item = getConfigItem(
    flattenSectionItems(sections),
    CONFIG_KEY_AUTH_REGISTRATION,
    defaultAuthRegistrationSettings,
  );
  return {
    registrationMode: readString(item.value.registrationMode, defaultAuthRegistrationSettings.registrationMode),
    allowRegistration: readBoolean(item.value.allowRegistration, defaultAuthRegistrationSettings.allowRegistration),
    requireEmailVerification: readBoolean(item.value.requireEmailVerification, defaultAuthRegistrationSettings.requireEmailVerification),
    inviteOnly: readBoolean(item.value.inviteOnly, defaultAuthRegistrationSettings.inviteOnly),
  };
}

export function parsePassword(sections: SettingsSection[]): AuthPasswordSettings {
  const item = getConfigItem(
    flattenSectionItems(sections),
    CONFIG_KEY_AUTH_PASSWORD,
    defaultAuthPasswordSettings,
  );
  return {
    minLength: readNumber(item.value.minLength, defaultAuthPasswordSettings.minLength),
    requireUppercase: readBoolean(item.value.requireUppercase, defaultAuthPasswordSettings.requireUppercase),
    requireNumber: readBoolean(item.value.requireNumber, defaultAuthPasswordSettings.requireNumber),
    requireSpecial: readBoolean(item.value.requireSpecial, defaultAuthPasswordSettings.requireSpecial),
    passwordResetable: readBoolean(item.value.passwordResetable, defaultAuthPasswordSettings.passwordResetable),
  };
}

export function parseSession(sections: SettingsSection[]): AuthSessionSettings {
  const item = getConfigItem(
    flattenSectionItems(sections),
    CONFIG_KEY_AUTH_SESSION,
    defaultAuthSessionSettings,
  );
  return {
    accessTokenMinutes: readNumber(item.value.accessTokenMinutes, defaultAuthSessionSettings.accessTokenMinutes),
    refreshTokenDays: readNumber(item.value.refreshTokenDays, defaultAuthSessionSettings.refreshTokenDays),
    allowMultiSession: readBoolean(item.value.allowMultiSession, defaultAuthSessionSettings.allowMultiSession),
    enableMFA: readBoolean(item.value.enableMFA, defaultAuthSessionSettings.enableMFA),
    lockoutThreshold: readNumber(item.value.lockoutThreshold, defaultAuthSessionSettings.lockoutThreshold),
    lockoutDurationMinutes: readNumber(item.value.lockoutDurationMinutes, defaultAuthSessionSettings.lockoutDurationMinutes),
  };
}

export function parseOAuthDisplay(sections: SettingsSection[]): OAuthDisplaySettings {
  const item = getConfigItem(
    flattenSectionItems(sections),
    CONFIG_KEY_AUTH_OAUTH_DISPLAY,
    defaultOAuthDisplaySettings,
  );
  return {
    showOnLogin: readBoolean(item.value.showOnLogin, defaultOAuthDisplaySettings.showOnLogin),
    providerOrder: readStringArray(item.value.providerOrder, defaultOAuthDisplaySettings.providerOrder),
    autoLinkByEmail: readBoolean(item.value.autoLinkByEmail, defaultOAuthDisplaySettings.autoLinkByEmail),
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
    authorizationUrl: readString(value.authorizationUrl, defaults.authorizationUrl),
    tokenUrl: readString(value.tokenUrl, defaults.tokenUrl),
    userInfoUrl: readString(value.userInfoUrl, defaults.userInfoUrl),
    scopes: readStringArray(value.scopes, defaults.scopes),
    usePkce: readBoolean(value.usePkce, defaults.usePkce),
    allowAutoRegister: readBoolean(value.allowAutoRegister, defaults.allowAutoRegister),
    allowLinkExisting: readBoolean(value.allowLinkExisting, defaults.allowLinkExisting),
    overwriteProfile: readBoolean(value.overwriteProfile, defaults.overwriteProfile),
    displayName: readString(value.displayName, defaults.displayName),
  };
}

export function parseOAuthProviders(sections: SettingsSection[]) {
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

export function parseSMTP(sections: SettingsSection[]): MailSMTPSettings {
  const item = getConfigItem(
    flattenSectionItems(sections),
    CONFIG_KEY_MAIL_SMTP,
    defaultMailSMTPSettings,
  );
  return {
    enabled: readBoolean(item.value.enabled, defaultMailSMTPSettings.enabled),
    listenAddr: readString(item.value.listenAddr, defaultMailSMTPSettings.listenAddr),
    hostname: readString(item.value.hostname, defaultMailSMTPSettings.hostname),
    dkimCnameTarget: readString(item.value.dkimCnameTarget, defaultMailSMTPSettings.dkimCnameTarget),
    maxMessageBytes: readNumber(item.value.maxMessageBytes, defaultMailSMTPSettings.maxMessageBytes),
  };
}

export function parseMailDelivery(sections: SettingsSection[]): MailDeliverySettings {
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
    insecureSkipVerify: readBoolean(item.value.insecureSkipVerify, defaultMailDeliverySettings.insecureSkipVerify),
  };
}

export function parseInbound(sections: SettingsSection[]): MailInboundSettings {
  const item = getConfigItem(
    flattenSectionItems(sections),
    CONFIG_KEY_MAIL_INBOUND,
    defaultMailInboundSettings,
  );
  return {
    allowCatchAll: readBoolean(item.value.allowCatchAll, defaultMailInboundSettings.allowCatchAll),
    requireExistingMailbox: readBoolean(item.value.requireExistingMailbox, defaultMailInboundSettings.requireExistingMailbox),
    retainRawDays: readNumber(item.value.retainRawDays, defaultMailInboundSettings.retainRawDays),
    maxAttachmentSizeMB: readNumber(item.value.maxAttachmentSizeMB, defaultMailInboundSettings.maxAttachmentSizeMB),
    rejectExecutableFiles: readBoolean(item.value.rejectExecutableFiles, defaultMailInboundSettings.rejectExecutableFiles),
    enableSpamScanningPreview: readBoolean(item.value.enableSpamScanningPreview, defaultMailInboundSettings.enableSpamScanningPreview),
  };
}

export function parseDomainPolicy(sections: SettingsSection[]): DomainPolicySettings {
  const item = getConfigItem(
    flattenSectionItems(sections),
    CONFIG_KEY_DOMAIN_POLICY,
    defaultDomainPolicySettings,
  );
  return {
    requiresReview: readBoolean(item.value.requiresReview, defaultDomainPolicySettings.requiresReview),
  };
}

export function parseAPILimits(sections: SettingsSection[]): APILimitsSettings {
  const item = getConfigItem(
    flattenSectionItems(sections),
    CONFIG_KEY_API_LIMITS,
    defaultAPILimitsSettings,
  );
  return {
    enabled: readBoolean(item.value.enabled, defaultAPILimitsSettings.enabled),
    identityMode: readString(item.value.identityMode, defaultAPILimitsSettings.identityMode),
    anonymousRPM: readNumber(item.value.anonymousRPM, defaultAPILimitsSettings.anonymousRPM),
    authenticatedRPM: readNumber(item.value.authenticatedRPM, defaultAPILimitsSettings.authenticatedRPM),
    authRPM: readNumber(item.value.authRPM, defaultAPILimitsSettings.authRPM),
    loginRPM: readNumber(item.value.loginRPM, defaultAPILimitsSettings.loginRPM),
    registerRPM: readNumber(item.value.registerRPM, defaultAPILimitsSettings.registerRPM),
    refreshRPM: readNumber(item.value.refreshRPM, defaultAPILimitsSettings.refreshRPM),
    forgotPasswordRPM: readNumber(item.value.forgotPasswordRPM, defaultAPILimitsSettings.forgotPasswordRPM),
    resetPasswordRPM: readNumber(item.value.resetPasswordRPM, defaultAPILimitsSettings.resetPasswordRPM),
    emailVerificationResendRPM: readNumber(item.value.emailVerificationResendRPM, defaultAPILimitsSettings.emailVerificationResendRPM),
    emailVerificationConfirmRPM: readNumber(item.value.emailVerificationConfirmRPM, defaultAPILimitsSettings.emailVerificationConfirmRPM),
    oauthStartRPM: readNumber(item.value.oauthStartRPM, defaultAPILimitsSettings.oauthStartRPM),
    oauthCallbackRPM: readNumber(item.value.oauthCallbackRPM, defaultAPILimitsSettings.oauthCallbackRPM),
    login2faVerifyRPM: readNumber(item.value.login2faVerifyRPM, defaultAPILimitsSettings.login2faVerifyRPM),
    mailboxWriteRPM: readNumber(item.value.mailboxWriteRPM, defaultAPILimitsSettings.mailboxWriteRPM),
    strictIpEnabled: readBoolean(item.value.strictIpEnabled, defaultAPILimitsSettings.strictIpEnabled),
    strictIpRPM: readNumber(item.value.strictIpRPM, defaultAPILimitsSettings.strictIpRPM),
  };
}
