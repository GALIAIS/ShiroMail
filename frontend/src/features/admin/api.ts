import { http } from "../../lib/http";
import type {
  ApiKeyDomainBindingInput,
  ApiKeyItem,
  DocArticle,
  DomainVerificationResult,
  DomainOption,
  MailExtractorRule,
  MailboxMessage,
  MessageExtractionResult,
  ParsedRawMessage,
  MailboxMessageSummary,
  NoticeItem,
  WebhookItem,
} from "../user/api";
import { normalizeMailExtractorRule } from "../user/extractor-rule-form";

export type AdminOverview = {
  activeMailboxCount: number;
  todayMessageCount: number;
  activeDomainCount: number;
  failedJobCount: number;
};

export type AdminUser = {
  id: number;
  username: string;
  email: string;
  status: string;
  emailVerified: boolean;
  roles: string[];
  mailboxes: number;
};

export type AdminMailbox = {
  id: number;
  userId: number;
  domainId: number;
  domain: string;
  localPart: string;
  address: string;
  ownerUsername: string;
  status: string;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
};

export type AdminMessage = {
  id: number;
  subject: string;
  mailboxAddress: string;
  fromAddr: string;
  status: string;
  receivedAt: string;
};

export type RuleItem = {
  id: string;
  name: string;
  retentionHours: number;
  autoExtend: boolean;
  updatedAt: string;
};

export type ConfigItem = {
  key: string;
  value: Record<string, unknown>;
  updatedBy: number;
  updatedAt: string;
};

export type SettingsSectionItem = ConfigItem;

export type SettingsSection = {
  key: string;
  title: string;
  description: string;
  items: SettingsSectionItem[];
};

export type DomainProviderItem = {
  id: number;
  provider: string;
  ownerType: string;
  ownerUserId?: number;
  displayName: string;
  authType: string;
  hasSecret: boolean;
  status: string;
  capabilities: string[];
  lastSyncAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type AdminDomainProviderInput = {
  provider: string;
  ownerType: string;
  ownerUserId?: number;
  displayName: string;
  authType: string;
  credentials: {
    apiToken: string;
    apiEmail: string;
    apiKey: string;
    apiSecret: string;
  };
  status: string;
  capabilities: string[];
};

export type ProviderZoneItem = {
  id: string;
  name: string;
  status: string;
};

export type ProviderRecordItem = {
  id?: string;
  type: string;
  name: string;
  value: string;
  ttl: number;
  priority: number;
  proxied: boolean;
};

export type DNSChangeOperationItem = {
  id: number;
  changeSetId?: number;
  operation: "create" | "update" | "delete" | string;
  recordType: string;
  recordName: string;
  before?: ProviderRecordItem;
  after?: ProviderRecordItem;
  status: string;
};

export type DNSChangeSetItem = {
  id: number;
  dnsZoneId?: number;
  providerAccountId: number;
  providerZoneId: string;
  zoneName: string;
  requestedByUserId?: number;
  requestedByApiKeyId?: number;
  status: string;
  provider: string;
  summary: string;
  operations: DNSChangeOperationItem[];
  createdAt: string;
  appliedAt?: string;
};

export type VerificationProfileItem = {
  verificationType: string;
  status: string;
  summary: string;
  expectedRecords: ProviderRecordItem[];
  observedRecords: ProviderRecordItem[];
  repairRecords: ProviderRecordItem[];
  lastCheckedAt?: string;
};

export type JobItem = {
  id: number;
  jobType: string;
  status: string;
  errorMessage?: string;
  createdAt: string;
};

export type AuditItem = {
  id: number;
  actorUserId: number;
  action: string;
  resourceType: string;
  resourceId: string;
  detail: Record<string, unknown>;
  createdAt: string;
};

export async function fetchAdminOverview() {
  const { data } = await http.get<AdminOverview>("/admin/overview");
  return data;
}

export async function fetchAdminUsers() {
  const { data } = await http.get<{ items: AdminUser[] }>("/admin/users");
  return data.items;
}

export async function updateAdminUserRoles(userId: number, roles: string[]) {
  const { data } = await http.put<AdminUser>(`/admin/users/${userId}/roles`, {
    roles,
  });
  return data;
}

export async function updateAdminUser(
  userId: number,
  input: {
    username: string;
    email: string;
    status: string;
    emailVerified: boolean;
    roles: string[];
    newPassword?: string;
  },
) {
  const { data } = await http.put<AdminUser>(`/admin/users/${userId}`, input);
  return data;
}

export async function deleteAdminUser(userId: number) {
  const { data } = await http.delete<{ ok: boolean }>(`/admin/users/${userId}`);
  return data;
}

export async function fetchAdminDomains() {
  const { data } = await http.get<{ items: DomainOption[] }>("/admin/domains");
  return data.items;
}

export async function fetchAdminDomainProviders() {
  const { data } = await http.get<{ items: DomainProviderItem[] }>(
    "/admin/domain-providers",
  );
  return data.items;
}

export async function createAdminDomainProvider(input: AdminDomainProviderInput) {
  const { data } = await http.post<DomainProviderItem>(
    "/admin/domain-providers",
    input,
  );
  return data;
}

export async function updateAdminDomainProvider(
  providerAccountId: number,
  input: AdminDomainProviderInput,
) {
  const { data } = await http.put<DomainProviderItem>(
    `/admin/domain-providers/${providerAccountId}`,
    input,
  );
  return data;
}

export async function deleteAdminDomainProvider(providerAccountId: number) {
  const { data } = await http.delete<{ ok: boolean }>(
    `/admin/domain-providers/${providerAccountId}`,
  );
  return data;
}

export async function validateAdminDomainProvider(providerAccountId: number) {
  const { data } = await http.post<DomainProviderItem>(
    `/admin/domain-providers/${providerAccountId}/validate`,
    {},
  );
  return data;
}

export async function fetchAdminDomainProviderZones(providerAccountId: number) {
  const { data } = await http.get<{ items: ProviderZoneItem[] }>(
    `/admin/domain-providers/${providerAccountId}/zones`,
  );
  return data.items;
}

export async function fetchAdminDomainProviderRecords(
  providerAccountId: number,
  zoneId: string,
) {
  const { data } = await http.get<{ items: ProviderRecordItem[] }>(
    `/admin/domain-providers/${providerAccountId}/zones/${encodeURIComponent(zoneId)}/records`,
  );
  return data.items;
}

export async function fetchAdminDomainProviderChangeSets(
  providerAccountId: number,
  zoneId: string,
) {
  const { data } = await http.get<{ items: DNSChangeSetItem[] }>(
    `/admin/domain-providers/${providerAccountId}/zones/${encodeURIComponent(zoneId)}/change-sets`,
  );
  return data.items;
}

export async function fetchAdminDomainProviderVerifications(
  providerAccountId: number,
  zoneId: string,
  zoneName: string,
) {
  const { data } = await http.get<{ items: VerificationProfileItem[] }>(
    `/admin/domain-providers/${providerAccountId}/zones/${encodeURIComponent(zoneId)}/verifications`,
    {
      params: { zoneName },
    },
  );
  return data.items;
}

export async function previewAdminDomainProviderChangeSet(
  providerAccountId: number,
  zoneId: string,
  input: { zoneName: string; records: ProviderRecordItem[] },
) {
  const { data } = await http.post<DNSChangeSetItem>(
    `/admin/domain-providers/${providerAccountId}/zones/${encodeURIComponent(zoneId)}/change-sets/preview`,
    input,
  );
  return data;
}

export async function applyAdminDNSChangeSet(changeSetId: number) {
  const { data } = await http.post<DNSChangeSetItem>(
    `/admin/dns-change-sets/${changeSetId}/apply`,
    {},
  );
  return data;
}

export async function upsertAdminDomain(input: {
  domain: string;
  status: string;
  visibility?: string;
  publicationStatus?: string;
  verificationScore?: number;
  healthStatus?: string;
  providerAccountId?: number;
  isDefault: boolean;
  weight: number;
}) {
  const { data } = await http.post<DomainOption>("/admin/domains", input);
  return data;
}

export async function deleteAdminDomain(domainId: number) {
  const { data } = await http.delete<{ ok: boolean }>(
    `/admin/domains/${domainId}`,
  );
  return data;
}

export async function verifyAdminDomain(domainId: number) {
  const { data } = await http.post<DomainVerificationResult>(
    `/admin/domains/${domainId}/verify`,
    {},
  );
  return data;
}

export async function generateAdminSubdomains(input: {
  baseDomainId: number;
  prefixes: string[];
  status?: string;
  visibility?: string;
  publicationStatus?: string;
  verificationScore?: number;
  healthStatus?: string;
  providerAccountId?: number;
  weight?: number;
}) {
  const { data } = await http.post<{ items: DomainOption[] }>(
    "/admin/domains/generate",
    input,
  );
  return data.items;
}

export async function reviewAdminDomainPublication(
  domainId: number,
  decision: "approve" | "reject",
) {
  const { data } = await http.post<DomainOption>(
    `/admin/domains/${domainId}/public-pool/review`,
    { decision },
  );
  return data;
}

export async function fetchAdminMailboxes() {
  const { data } = await http.get<{ items: AdminMailbox[] }>(
    "/admin/mailboxes",
  );
  return data.items;
}

export async function fetchAdminMailboxDomains() {
  const { data } = await http.get<{ items: DomainOption[] }>(
    "/admin/mailboxes/domains",
  );
  return data.items;
}

export async function createAdminMailbox(input: {
  userId: number;
  domainId: number;
  expiresInHours: number;
  localPart?: string;
}) {
  const { data } = await http.post<AdminMailbox>("/admin/mailboxes", input);
  return data;
}

export async function extendAdminMailbox(
  mailboxId: number,
  expiresInHours: number,
) {
  const { data } = await http.post<AdminMailbox>(
    `/admin/mailboxes/${mailboxId}/extend`,
    { expiresInHours },
  );
  return data;
}

export async function releaseAdminMailbox(mailboxId: number) {
  const { data } = await http.post<AdminMailbox>(
    `/admin/mailboxes/${mailboxId}/release`,
    {},
  );
  return data;
}

export async function fetchAdminMailboxMessages(mailboxId: number) {
  const { data } = await http.get<{ items: MailboxMessageSummary[] }>(
    `/admin/mailboxes/${mailboxId}/messages`,
  );
  return data.items;
}

export async function fetchAdminMailboxMessageDetail(
  mailboxId: number,
  messageId: number,
) {
  const { data } = await http.get<MailboxMessage>(
    `/admin/mailboxes/${mailboxId}/messages/${messageId}`,
  );
  return data;
}

export async function fetchAdminMailboxMessageRawText(
  mailboxId: number,
  messageId: number,
) {
  const response = await http.get<string>(
    `/admin/mailboxes/${mailboxId}/messages/${messageId}/raw`,
    {
      responseType: "text",
    },
  );
  return typeof response.data === "string" ? response.data : String(response.data ?? "");
}

export async function fetchAdminMailboxMessageParsedRaw(
  mailboxId: number,
  messageId: number,
) {
  const { data } = await http.get<ParsedRawMessage>(
    `/admin/mailboxes/${mailboxId}/messages/${messageId}/raw/parsed`,
  );
  return {
    ...data,
    headers: data.headers ?? {},
    attachments: data.attachments ?? [],
  };
}

export async function downloadAdminMailboxMessageRaw(
  mailboxId: number,
  messageId: number,
) {
  const response = await http.get<Blob>(
    `/admin/mailboxes/${mailboxId}/messages/${messageId}/raw`,
    {
      responseType: "blob",
    },
  );
  const fileName = parseDownloadFileName(
    response.headers["content-disposition"],
    `message-${messageId}.eml`,
  );
  triggerBrowserDownload(response.data, fileName);
}

export async function downloadAdminMailboxMessageAttachment(
  mailboxId: number,
  messageId: number,
  attachmentIndex: number,
) {
  const response = await http.get<Blob>(
    `/admin/mailboxes/${mailboxId}/messages/${messageId}/attachments/${attachmentIndex}`,
    {
      responseType: "blob",
    },
  );
  const fileName = parseDownloadFileName(
    response.headers["content-disposition"],
    `attachment-${attachmentIndex + 1}`,
  );
  triggerBrowserDownload(response.data, fileName);
}

export async function fetchAdminMailboxMessageAttachmentBlob(
  mailboxId: number,
  messageId: number,
  attachmentIndex: number,
) {
  const response = await http.get<Blob>(
    `/admin/mailboxes/${mailboxId}/messages/${messageId}/attachments/${attachmentIndex}`,
    {
      responseType: "blob",
    },
  );
  return response.data instanceof Blob ? response.data : new Blob([response.data]);
}

export async function fetchAdminMessages() {
  const { data } = await http.get<{ items: AdminMessage[] }>("/admin/messages");
  return data.items;
}

export async function fetchAdminApiKeys() {
  const { data } = await http.get<{ items: ApiKeyItem[] }>("/admin/api-keys");
  return (data.items ?? []).map(normalizeAdminApiKeyItem);
}

export async function createAdminApiKey(input: {
  name: string;
  scopes?: string[];
  resourcePolicy?: ApiKeyItem["resourcePolicy"];
  domainBindings?: ApiKeyDomainBindingInput[];
}) {
  const { data } = await http.post<ApiKeyItem>("/admin/api-keys", input);
  return normalizeAdminApiKeyItem(data);
}

export async function rotateAdminApiKey(apiKeyId: number) {
  const { data } = await http.post<ApiKeyItem>(
    `/admin/api-keys/${apiKeyId}/rotate`,
    {},
  );
  return normalizeAdminApiKeyItem(data);
}

export async function revokeAdminApiKey(apiKeyId: number) {
  const { data } = await http.post<ApiKeyItem>(
    `/admin/api-keys/${apiKeyId}/revoke`,
    {},
  );
  return normalizeAdminApiKeyItem(data);
}

export async function fetchAdminWebhooks() {
  const { data } = await http.get<{ items: WebhookItem[] }>("/admin/webhooks");
  return data.items;
}

export async function createAdminWebhook(input: {
  userId: number;
  name: string;
  targetUrl: string;
  events: string[];
}) {
  const { data } = await http.post<WebhookItem>("/admin/webhooks", input);
  return data;
}

export async function updateAdminWebhook(
  webhookId: number,
  input: { name: string; targetUrl: string; events: string[] },
) {
  const { data } = await http.put<WebhookItem>(
    `/admin/webhooks/${webhookId}`,
    input,
  );
  return data;
}

export async function toggleAdminWebhook(webhookId: number, enabled: boolean) {
  const { data } = await http.post<WebhookItem>(
    `/admin/webhooks/${webhookId}/toggle`,
    {
      enabled,
    },
  );
  return data;
}

export async function fetchAdminNotices() {
  const { data } = await http.get<{ items: NoticeItem[] }>("/admin/notices");
  return data.items;
}

export async function createAdminNotice(input: {
  title: string;
  body: string;
  category: string;
  level: string;
}) {
  const { data } = await http.post<NoticeItem>("/admin/notices", input);
  return data;
}

export async function updateAdminNotice(
  noticeId: number,
  input: {
    title: string;
    body: string;
    category: string;
    level: string;
  },
) {
  const { data } = await http.put<NoticeItem>(`/admin/notices/${noticeId}`, input);
  return data;
}

export async function deleteAdminNotice(noticeId: number) {
  const { data } = await http.delete<{ ok: boolean }>(`/admin/notices/${noticeId}`);
  return data;
}

export async function fetchAdminDocs() {
  const { data } = await http.get<{ items: DocArticle[] }>("/admin/docs");
  return data.items;
}

export async function createAdminDoc(input: {
  title: string;
  category: string;
  summary: string;
  readTimeMin: number;
  tags: string[];
}) {
  const { data } = await http.post<DocArticle>("/admin/docs", input);
  return data;
}

export async function updateAdminDoc(
  docId: string,
  input: {
    title: string;
    category: string;
    summary: string;
    readTimeMin: number;
    tags: string[];
  },
) {
  const { data } = await http.put<DocArticle>(`/admin/docs/${docId}`, input);
  return data;
}

export async function deleteAdminDoc(docId: string) {
  const { data } = await http.delete<{ ok: boolean }>(`/admin/docs/${docId}`);
  return data;
}

export async function fetchAdminRules() {
  const { data } = await http.get<{ items: RuleItem[] }>("/admin/rules");
  return data.items;
}

export async function fetchAdminMailExtractorRules() {
  const { data } = await http.get<{ items: MailExtractorRule[] }>("/admin/mail-extractor-rules");
  return (data.items ?? []).map(normalizeMailExtractorRule);
}

export async function createAdminMailExtractorRule(
  input: Omit<MailExtractorRule, "id" | "sourceType" | "enabledForUser" | "createdAt" | "updatedAt">,
) {
  const { data } = await http.post<MailExtractorRule>("/admin/mail-extractor-rules", input);
  return normalizeMailExtractorRule(data);
}

export async function updateAdminMailExtractorRule(
  ruleId: number,
  input: Omit<MailExtractorRule, "id" | "sourceType" | "enabledForUser" | "createdAt" | "updatedAt">,
) {
  const { data } = await http.put<MailExtractorRule>(`/admin/mail-extractor-rules/${ruleId}`, input);
  return normalizeMailExtractorRule(data);
}

export async function deleteAdminMailExtractorRule(ruleId: number) {
  const { data } = await http.delete<{ ok: boolean }>(`/admin/mail-extractor-rules/${ruleId}`);
  return data;
}

export async function testAdminMailExtractorRule(
  rule: Omit<MailExtractorRule, "id" | "sourceType" | "enabledForUser" | "createdAt" | "updatedAt">,
  sample: {
    mailboxId?: number;
    messageId?: number;
    subject?: string;
    fromAddr?: string;
    toAddr?: string;
    textBody?: string;
    htmlBody?: string;
    rawText?: string;
  },
) {
  const { data } = await http.post<MessageExtractionResult>("/admin/mail-extractor-rules/test", {
    rule,
    sample,
  });
  return data;
}

export async function fetchAdminMailboxMessageExtractions(mailboxId: number, messageId: number) {
  const { data } = await http.get<MessageExtractionResult>(`/admin/mailboxes/${mailboxId}/messages/${messageId}/extractions`);
  return {
    items: data.items ?? [],
  };
}

export async function upsertAdminRule(
  id: string,
  input: { name: string; retentionHours: number; autoExtend: boolean },
) {
  const { data } = await http.put<RuleItem>(`/admin/rules/${id}`, input);
  return data;
}

export async function fetchAdminConfigs() {
  const { data } = await http.get<{ items: ConfigItem[] }>("/admin/configs");
  return data.items;
}

export async function fetchAdminSettingsSections() {
  const { data } = await http.get<{ items: SettingsSection[] }>(
    "/admin/settings/sections",
  );
  return data.items;
}

export async function upsertAdminConfig(
  key: string,
  value: Record<string, unknown>,
) {
  const { data } = await http.put<ConfigItem>(`/admin/configs/${key}`, {
    value,
  });
  return data;
}

export async function deleteAdminConfig(key: string) {
  await http.delete(`/admin/configs/${key}`);
}

export async function sendAdminMailDeliveryTest(input: { to?: string }) {
  const { data } = await http.post<{ status: string; recipient: string }>(
    "/admin/configs/mail.delivery/test",
    input,
    {
      // Real SMTP providers can take longer than the default API timeout.
      timeout: 30_000,
    },
  );
  return data;
}

export async function fetchAdminJobs() {
  const { data } = await http.get<{ items: JobItem[] }>("/admin/jobs");
  return data.items;
}

export async function fetchAdminAudit() {
  const { data } = await http.get<{ items: AuditItem[] }>("/admin/audit");
  return data.items;
}

function normalizeAdminApiKeyItem(item: ApiKeyItem): ApiKeyItem {
  return {
    ...item,
    scopes: item.scopes ?? [],
    domainBindings: item.domainBindings ?? [],
    resourcePolicy: {
      domainAccessMode: item.resourcePolicy?.domainAccessMode ?? "mixed",
      allowPlatformPublicDomains:
        item.resourcePolicy?.allowPlatformPublicDomains ?? true,
      allowUserPublishedDomains:
        item.resourcePolicy?.allowUserPublishedDomains ?? true,
      allowOwnedPrivateDomains:
        item.resourcePolicy?.allowOwnedPrivateDomains ?? true,
      allowProviderMutation:
        item.resourcePolicy?.allowProviderMutation ?? false,
      allowProtectedRecordWrite:
        item.resourcePolicy?.allowProtectedRecordWrite ?? false,
    },
  };
}

function triggerBrowserDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function parseDownloadFileName(
  headerValue: string | undefined,
  fallback: string,
) {
  if (!headerValue) {
    return fallback;
  }

  const utf8Match = headerValue.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    return decodeURIComponent(utf8Match[1]);
  }

  const basicMatch = headerValue.match(/filename="?([^";]+)"?/i);
  if (basicMatch?.[1]) {
    return basicMatch[1];
  }

  return fallback;
}
