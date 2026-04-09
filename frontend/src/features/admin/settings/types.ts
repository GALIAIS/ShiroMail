export type AdminConfigItem = {
  key: string;
  value: Record<string, unknown>;
  updatedBy: number;
  updatedAt: string;
};

export type AdminSettingsSection = {
  key: string;
  title: string;
  description: string;
  items: AdminConfigItem[];
};

export type SiteIdentitySettings = {
  siteName: string;
  slogan: string;
  supportEmail: string;
  siteIconUrl: string;
  appBaseUrl: string;
  defaultLanguage: string;
  defaultTimeZone: string;
  ambientThemeEnabled: boolean;
  ambientThemeIntensity: string;
};

export type AuthRegistrationSettings = {
  registrationMode: string;
  allowRegistration: boolean;
  requireEmailVerification: boolean;
  inviteOnly: boolean;
};

export type AuthPasswordSettings = {
  minLength: number;
  requireUppercase: boolean;
  requireNumber: boolean;
  requireSpecial: boolean;
  passwordResetable: boolean;
};

export type AuthSessionSettings = {
  accessTokenMinutes: number;
  refreshTokenDays: number;
  allowMultiSession: boolean;
  enableMFA: boolean;
  lockoutThreshold: number;
  lockoutDurationMinutes: number;
};

export type OAuthDisplaySettings = {
  showOnLogin: boolean;
  providerOrder: string[];
  autoLinkByEmail: boolean;
};

export type OAuthProviderSettings = {
  slug: string;
  enabled: boolean;
  clientId: string;
  clientSecret: string;
  redirectUrl: string;
  authorizationUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
  scopes: string[];
  usePkce: boolean;
  allowAutoRegister: boolean;
  allowLinkExisting: boolean;
  overwriteProfile: boolean;
  displayName: string;
};

export type OAuthProviderPreset = {
  slug: string;
  displayName: string;
  authorizationUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
  scopes: string[];
  usePkce: boolean;
};

export type MailSMTPSettings = {
  enabled: boolean;
  listenAddr: string;
  hostname: string;
  dkimCnameTarget: string;
  maxMessageBytes: number;
};

export type MailDeliverySettings = {
  enabled: boolean;
  host: string;
  port: number;
  username: string;
  password: string;
  fromAddress: string;
  fromName: string;
  transportMode: string;
  insecureSkipVerify: boolean;
};

export type MailInboundSettings = {
  allowCatchAll: boolean;
  requireExistingMailbox: boolean;
  retainRawDays: number;
  maxAttachmentSizeMB: number;
  rejectExecutableFiles: boolean;
  enableSpamScanningPreview: boolean;
};

export type APILimitsSettings = {
  enabled: boolean;
  identityMode: string;
  anonymousRPM: number;
  authenticatedRPM: number;
  authRPM: number;
  loginRPM: number;
  registerRPM: number;
  refreshRPM: number;
  forgotPasswordRPM: number;
  resetPasswordRPM: number;
  emailVerificationResendRPM: number;
  emailVerificationConfirmRPM: number;
  oauthStartRPM: number;
  oauthCallbackRPM: number;
  login2faVerifyRPM: number;
  mailboxWriteRPM: number;
  strictIpEnabled: boolean;
  strictIpRPM: number;
};

export type DomainPolicySettings = {
  requiresReview: boolean;
};
