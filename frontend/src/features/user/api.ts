import { http } from "../../lib/http";
import { normalizeMailExtractorRule } from "./extractor-rule-form";

export type DomainOption = {
  id: number;
  domain: string;
  status: string;
  ownerUserId?: number;
  visibility: string;
  publicationStatus: string;
  verificationScore: number;
  healthStatus: string;
  providerAccountId?: number;
  provider?: string;
  providerDisplayName?: string;
  isDefault: boolean;
  weight: number;
  rootDomain: string;
  parentDomain: string;
  level: number;
  kind: string;
};

export type UserDomainProviderItem = {
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

export type UserProviderZoneItem = {
  id: string;
  name: string;
  status: string;
};

export type UserProviderRecordItem = {
  id?: string;
  type: string;
  name: string;
  value: string;
  ttl: number;
  priority: number;
  proxied: boolean;
};

export type UserDNSChangeOperationItem = {
  id: number;
  changeSetId?: number;
  operation: "create" | "update" | "delete" | string;
  recordType: string;
  recordName: string;
  before?: UserProviderRecordItem;
  after?: UserProviderRecordItem;
  status: string;
};

export type UserDNSChangeSetItem = {
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
  operations: UserDNSChangeOperationItem[];
  createdAt: string;
  appliedAt?: string;
};

export type UserVerificationProfileItem = {
  verificationType: string;
  status: string;
  summary: string;
  expectedRecords: UserProviderRecordItem[];
  observedRecords: UserProviderRecordItem[];
  repairRecords: UserProviderRecordItem[];
  lastCheckedAt?: string;
};

export type DomainVerificationResult = {
  domain: DomainOption;
  passed: boolean;
  summary: string;
  zoneName?: string;
  profiles: UserVerificationProfileItem[];
  verifiedCount: number;
  totalCount: number;
};

export type MailboxItem = {
  id: number;
  userId: number;
  domainId: number;
  domain: string;
  localPart: string;
  address: string;
  status: string;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
};

export type DashboardPayload = {
  totalMailboxCount: number;
  activeMailboxCount: number;
  availableDomains: DomainOption[];
  mailboxes: MailboxItem[];
  unreadCounts: Record<number, number>;
};

export type PortalOverview = {
  username: string;
  email: string;
  displayName: string;
  mailboxQuota: number;
  domainQuota: number;
  activeApiKeyCount: number;
  enabledWebhookCount: number;
  openFeedbackCount: number;
  noticeCount: number;
  balanceCents: number;
};

export type MessageAttachment = {
  fileName: string;
  contentType: string;
  storageKey: string;
  sizeBytes: number;
};

export type ParsedRawAttachment = {
  fileName: string;
  contentType: string;
  contentId: string;
  sizeBytes: number;
};

export type ParsedRawMessage = {
  messageId: number;
  mailboxId: number;
  subject: string;
  fromAddr: string;
  toAddr: string;
  receivedAt: string;
  textBody: string;
  htmlBody: string;
  headers: Record<string, string[]>;
  attachmentCount: number;
  attachments: ParsedRawAttachment[];
  rawSizeBytes: number;
};

export type MailboxMessage = {
  id: number;
  mailboxId: number;
  legacyMailboxKey: string;
  legacyMessageKey: string;
  sourceKind: string;
  sourceMessageId: string;
  mailboxAddress: string;
  fromAddr: string;
  toAddr: string;
  subject: string;
  textPreview: string;
  htmlPreview: string;
  textBody: string;
  htmlBody: string;
  headers: Record<string, string[]>;
  rawStorageKey: string;
  hasAttachments: boolean;
  sizeBytes: number;
  isRead: boolean;
  isDeleted: boolean;
  receivedAt: string;
  attachments: MessageAttachment[];
};

export type MailboxMessageSummary = {
  id: number;
  mailboxId: number;
  legacyMailboxKey: string;
  legacyMessageKey: string;
  sourceKind: string;
  sourceMessageId: string;
  mailboxAddress: string;
  fromAddr: string;
  toAddr: string;
  subject: string;
  textPreview: string;
  htmlPreview: string;
  hasAttachments: boolean;
  attachmentCount: number;
  sizeBytes: number;
  isRead: boolean;
  isDeleted: boolean;
  receivedAt: string;
};

export type MailExtractorRule = {
  id: number;
  ownerUserId?: number;
  sourceType: "user" | "admin_default" | string;
  templateKey?: string;
  name: string;
  description: string;
  label: string;
  enabled: boolean;
  enabledForUser?: boolean;
  targetFields: string[];
  pattern: string;
  flags: string;
  resultMode: string;
  captureGroupIndex?: number;
  mailboxIds: number[];
  domainIds: number[];
  senderContains: string;
  subjectContains: string;
  sortOrder: number;
  createdAt?: string;
  updatedAt?: string;
};

export type MailExtractorRuleList = {
  rules: MailExtractorRule[];
  templates: MailExtractorRule[];
};

export type MessageExtractionItem = {
  ruleId: number;
  ruleName: string;
  label: string;
  sourceType: string;
  sourceField: string;
  value: string;
  values?: string[];
  matchedText?: string;
  captureGroup?: number;
};

export type MessageExtractionResult = {
  items: MessageExtractionItem[];
};

type MailboxMessageWire = Omit<MailboxMessage, "attachments" | "headers"> & {
  legacyMailboxKey?: string | null;
  legacyMessageKey?: string | null;
  attachments?: MessageAttachment[] | null;
  headers?: Record<string, string[]> | null;
};

type MailboxMessageSummaryWire = Omit<MailboxMessageSummary, "legacyMailboxKey" | "legacyMessageKey" | "attachmentCount"> & {
  legacyMailboxKey?: string | null;
  legacyMessageKey?: string | null;
  attachmentCount?: number | null;
};

export type NoticeItem = {
  id: number;
  title: string;
  body: string;
  category: string;
  level: string;
  publishedAt: string;
};

export type FeedbackTicket = {
  id: number;
  userId: number;
  category: string;
  subject: string;
  content: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type ApiKeyItem = {
  id: number;
  userId: number;
  name: string;
  keyPrefix: string;
  keyPreview: string;
  plainSecret?: string;
  status: string;
  scopes: string[];
  resourcePolicy: {
    domainAccessMode: string;
    allowPlatformPublicDomains: boolean;
    allowUserPublishedDomains: boolean;
    allowOwnedPrivateDomains: boolean;
    allowProviderMutation: boolean;
    allowProtectedRecordWrite: boolean;
  };
  domainBindings: Array<{
    id: number;
    zoneId?: number;
    nodeId?: number;
    accessLevel: string;
  }>;
  createdAt: string;
  lastUsedAt?: string;
  rotatedAt?: string;
  revokedAt?: string;
};

export type ApiKeyDomainBindingInput = {
  zoneId?: number;
  nodeId?: number;
  accessLevel: string;
};

export type WebhookItem = {
  id: number;
  userId: number;
  name: string;
  targetUrl: string;
  secretPreview: string;
  events: string[];
  enabled: boolean;
  lastDeliveredAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type DocArticle = {
  id: string;
  title: string;
  category: string;
  summary: string;
  readTimeMin: number;
  tags: string[];
  createdAt: string;
  updatedAt: string;
};

export type BillingProfile = {
  userId: number;
  planCode: string;
  planName: string;
  status: string;
  mailboxQuota: number;
  domainQuota: number;
  dailyRequestLimit: number;
  renewalAt: string;
};

export type BalanceEntry = {
  id: number;
  userId: number;
  entryType: string;
  amount: number;
  description: string;
  createdAt: string;
};

export type BalancePayload = {
  balanceCents: number;
  entries: BalanceEntry[];
};

export type UserSettings = {
  userId: number;
  displayName: string;
  email: string;
  locale: string;
  timezone: string;
  autoRefreshSeconds: number;
  createdAt: string;
  updatedAt: string;
};

export async function fetchDashboard() {
  const { data } = await http.get<DashboardPayload>("/dashboard");
  return data;
}

export type DailyTrendItem = {
  date: string;
  count: number;
};

export async function fetchDashboardTrend(days = 7) {
  const { data } = await http.get<{ items: DailyTrendItem[] }>("/dashboard/trend", { params: { days } });
  return data.items;
}

export type RecentActivityItem = {
  id: number;
  mailboxId: number;
  mailboxAddress: string;
  fromAddr: string;
  subject: string;
  textPreview: string;
  isRead: boolean;
  hasAttachments: boolean;
  receivedAt: string;
};

export async function fetchRecentActivity(limit = 10) {
  const { data } = await http.get<{ items: RecentActivityItem[] }>("/dashboard/activity", { params: { limit } });
  return data.items ?? [];
}

export type GlobalSearchResult = {
  id: number;
  mailboxId: number;
  mailboxAddress: string;
  fromAddr: string;
  subject: string;
  textPreview: string;
  isRead: boolean;
  hasAttachments: boolean;
  receivedAt: string;
};

export async function searchMessages(query: string) {
  const { data } = await http.get<{ items: GlobalSearchResult[] }>("/dashboard/search", { params: { q: query } });
  return data.items ?? [];
}

export async function fetchPortalOverview() {
  const { data } = await http.get<PortalOverview>("/portal/overview");
  return data;
}

export async function fetchDomains() {
  const { data } = await http.get<{ items: DomainOption[] }>("/domains");
  return data.items;
}

export async function createDomain(input: {
  domain: string;
  status?: string;
  visibility?: string;
  publicationStatus?: string;
  verificationScore?: number;
  healthStatus?: string;
  providerAccountId?: number;
  isDefault?: boolean;
  weight?: number;
}) {
  const { data } = await http.post<DomainOption>("/domains", input);
  return data;
}

export async function deleteDomain(domainId: number) {
  const { data } = await http.delete<{ ok: boolean }>(`/domains/${domainId}`);
  return data;
}

export async function updateDomainProviderBinding(domainId: number, providerAccountId?: number) {
  const { data } = await http.put<DomainOption>(`/domains/${domainId}/provider-binding`, {
    providerAccountId: providerAccountId ?? null,
  });
  return data;
}

export async function generateSubdomains(input: {
  baseDomainId: number;
  prefixes: string[];
  status?: string;
  visibility?: string;
  publicationStatus?: string;
  verificationScore?: number;
  healthStatus?: string;
  weight?: number;
}) {
  const { data } = await http.post<{ items: DomainOption[] }>("/domains/generate", input);
  return data.items;
}

export async function requestDomainPublicPool(domainId: number) {
  const { data } = await http.post<DomainOption>(`/domains/${domainId}/public-pool`, {});
  return data;
}

export async function withdrawDomainPublicPool(domainId: number) {
  const { data } = await http.post<DomainOption>(`/domains/${domainId}/public-pool/withdraw`, {});
  return data;
}

export async function verifyDomain(domainId: number) {
  const { data } = await http.post<DomainVerificationResult>(`/domains/${domainId}/verify`, {});
  return data;
}

export async function fetchDomainProviders() {
  const { data } = await http.get<{ items: UserDomainProviderItem[] }>("/portal/domain-providers");
  return data.items;
}

export async function createDomainProvider(input: {
  provider: string;
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
}) {
  const { data } = await http.post<UserDomainProviderItem>("/portal/domain-providers", input);
  return data;
}

export async function updateDomainProvider(
  providerAccountId: number,
  input: {
    provider: string;
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
  },
) {
  const { data } = await http.put<UserDomainProviderItem>(`/portal/domain-providers/${providerAccountId}`, input);
  return data;
}

export async function validateDomainProvider(providerAccountId: number) {
  const { data } = await http.post<UserDomainProviderItem>(`/portal/domain-providers/${providerAccountId}/validate`, {});
  return data;
}

export async function deleteDomainProvider(providerAccountId: number) {
  const { data } = await http.delete<{ ok: boolean }>(`/portal/domain-providers/${providerAccountId}`);
  return data;
}

export async function fetchDomainProviderZones(providerAccountId: number) {
  const { data } = await http.get<{ items: UserProviderZoneItem[] }>(`/portal/domain-providers/${providerAccountId}/zones`);
  return data.items;
}

export async function fetchDomainProviderRecords(providerAccountId: number, zoneId: string) {
  const { data } = await http.get<{ items: UserProviderRecordItem[] }>(
    `/portal/domain-providers/${providerAccountId}/zones/${encodeURIComponent(zoneId)}/records`,
  );
  return data.items;
}

export async function fetchDomainProviderChangeSets(providerAccountId: number, zoneId: string) {
  const { data } = await http.get<{ items: UserDNSChangeSetItem[] }>(
    `/portal/domain-providers/${providerAccountId}/zones/${encodeURIComponent(zoneId)}/change-sets`,
  );
  return data.items;
}

export async function fetchDomainProviderVerifications(providerAccountId: number, zoneId: string, zoneName: string) {
  const { data } = await http.get<{ items: UserVerificationProfileItem[] }>(
    `/portal/domain-providers/${providerAccountId}/zones/${encodeURIComponent(zoneId)}/verifications`,
    { params: { zoneName } },
  );
  return data.items;
}

export async function previewDomainProviderChangeSet(
  providerAccountId: number,
  zoneId: string,
  input: {
    zoneName: string;
    records: UserProviderRecordItem[];
  },
) {
  const { data } = await http.post<UserDNSChangeSetItem>(
    `/portal/domain-providers/${providerAccountId}/zones/${encodeURIComponent(zoneId)}/change-sets/preview`,
    input,
  );
  return data;
}

export async function applyDomainProviderChangeSet(changeSetId: number) {
  const { data } = await http.post<UserDNSChangeSetItem>(`/portal/dns-change-sets/${changeSetId}/apply`);
  return data;
}

export async function fetchMailboxMessages(mailboxId: number, query?: string) {
  const params: Record<string, string> = {};
  if (query) {
    params.q = query;
  }
  const { data } = await http.get<{ items: MailboxMessageSummaryWire[] }>(`/mailboxes/${mailboxId}/messages`, { params });
  return data.items.map(normalizeMailboxMessageSummary);
}

export async function fetchMailboxMessageDetail(mailboxId: number, messageId: number) {
  const { data } = await http.get<MailboxMessageWire>(`/mailboxes/${mailboxId}/messages/${messageId}`);
  return normalizeMailboxMessage(data);
}

export async function fetchMailExtractorRules() {
  const { data } = await http.get<MailExtractorRuleList>("/portal/mail-extractor-rules");
  return {
    rules: (data.rules ?? []).map(normalizeMailExtractorRule),
    templates: (data.templates ?? []).map(normalizeMailExtractorRule),
  };
}

export async function createMailExtractorRule(input: Omit<MailExtractorRule, "id" | "sourceType" | "enabledForUser" | "createdAt" | "updatedAt">) {
  const { data } = await http.post<MailExtractorRule>("/portal/mail-extractor-rules", input);
  return normalizeMailExtractorRule(data);
}

export async function updateMailExtractorRule(ruleId: number, input: Omit<MailExtractorRule, "id" | "sourceType" | "enabledForUser" | "createdAt" | "updatedAt">) {
  const { data } = await http.put<MailExtractorRule>(`/portal/mail-extractor-rules/${ruleId}`, input);
  return normalizeMailExtractorRule(data);
}

export async function deleteMailExtractorRule(ruleId: number) {
  const { data } = await http.delete<{ ok: boolean }>(`/portal/mail-extractor-rules/${ruleId}`);
  return data;
}

export async function testMailExtractorRule(
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
  const { data } = await http.post<MessageExtractionResult>("/portal/mail-extractor-rules/test", {
    rule,
    sample,
  });
  return data;
}

export async function enableMailExtractorTemplate(ruleId: number) {
  const { data } = await http.post<{ ok: boolean }>(`/portal/mail-extractor-rules/templates/${ruleId}/enable`, {});
  return data;
}

export async function disableMailExtractorTemplate(ruleId: number) {
  const { data } = await http.post<{ ok: boolean }>(`/portal/mail-extractor-rules/templates/${ruleId}/disable`, {});
  return data;
}

export async function copyMailExtractorTemplate(ruleId: number) {
  const { data } = await http.post<MailExtractorRule>(`/portal/mail-extractor-rules/templates/${ruleId}/copy`, {});
  return normalizeMailExtractorRule(data);
}

export async function fetchMailboxMessageExtractions(mailboxId: number, messageId: number) {
  const { data } = await http.get<MessageExtractionResult>(`/portal/mailboxes/${mailboxId}/messages/${messageId}/extractions`);
  return {
    items: data.items ?? [],
  };
}

export async function fetchMailboxMessageRawText(mailboxId: number, messageId: number) {
  const response = await http.get<string>(`/mailboxes/${mailboxId}/messages/${messageId}/raw`, {
    responseType: "text",
  });
  return typeof response.data === "string" ? response.data : String(response.data ?? "");
}

export async function fetchMailboxMessageParsedRaw(mailboxId: number, messageId: number) {
  const { data } = await http.get<ParsedRawMessage>(`/mailboxes/${mailboxId}/messages/${messageId}/raw/parsed`);
  return {
    ...data,
    headers: data.headers ?? {},
    attachments: data.attachments ?? [],
  };
}

export async function downloadMailboxMessageRaw(mailboxId: number, messageId: number) {
  await downloadBinary(`/mailboxes/${mailboxId}/messages/${messageId}/raw`, `message-${messageId}.eml`);
}

export async function downloadMailboxMessageAttachment(mailboxId: number, messageId: number, index: number) {
  await downloadBinary(`/mailboxes/${mailboxId}/messages/${messageId}/attachments/${index}`, `attachment-${index + 1}.bin`);
}

export async function fetchMailboxMessageAttachmentBlob(mailboxId: number, messageId: number, index: number) {
  const response = await http.get<Blob>(`/mailboxes/${mailboxId}/messages/${messageId}/attachments/${index}`, {
    responseType: "blob",
  });
  return response.data instanceof Blob ? response.data : new Blob([response.data]);
}

export async function createMailbox(input: { domainId: number; expiresInHours: number }) {
  const { data } = await http.post<MailboxItem>("/mailboxes", input);
  return data;
}

export async function createCustomMailbox(input: { domainId: number; expiresInHours: number; localPart: string }) {
  const { data } = await http.post<MailboxItem>("/mailboxes", input);
  return data;
}

export async function extendMailbox(mailboxId: number, expiresInHours: number) {
  const { data } = await http.post<MailboxItem>(`/mailboxes/${mailboxId}/extend`, { expiresInHours });
  return data;
}

export async function releaseMailbox(mailboxId: number) {
  const { data } = await http.post<MailboxItem>(`/mailboxes/${mailboxId}/release`);
  return data;
}

export async function fetchNotices() {
  const { data } = await http.get<{ items: NoticeItem[] }>("/portal/notices");
  return data.items;
}

export async function fetchFeedback() {
  const { data } = await http.get<{ items: FeedbackTicket[] }>("/portal/feedback");
  return data.items;
}

export async function createFeedback(input: { category: string; subject: string; content: string }) {
  const { data } = await http.post<FeedbackTicket>("/portal/feedback", input);
  return data;
}

export async function fetchApiKeys() {
  const { data } = await http.get<{ items: ApiKeyItem[] }>("/portal/api-keys");
  return (data.items ?? []).map(normalizeApiKeyItem);
}

export async function createApiKey(input: {
  name: string;
  scopes?: string[];
  resourcePolicy?: ApiKeyItem["resourcePolicy"];
  domainBindings?: ApiKeyDomainBindingInput[];
}) {
  const { data } = await http.post<ApiKeyItem>("/portal/api-keys", input);
  return normalizeApiKeyItem(data);
}

export async function rotateApiKey(apiKeyId: number) {
  const { data } = await http.post<ApiKeyItem>(`/portal/api-keys/${apiKeyId}/rotate`);
  return normalizeApiKeyItem(data);
}

export async function revokeApiKey(apiKeyId: number) {
  const { data } = await http.post<ApiKeyItem>(`/portal/api-keys/${apiKeyId}/revoke`);
  return normalizeApiKeyItem(data);
}

export async function fetchWebhooks() {
  const { data } = await http.get<{ items: WebhookItem[] }>("/portal/webhooks");
  return data.items;
}

export async function createWebhook(input: { name: string; targetUrl: string; events: string[] }) {
  const { data } = await http.post<WebhookItem>("/portal/webhooks", input);
  return data;
}

export async function updateWebhook(webhookId: number, input: { name: string; targetUrl: string; events: string[] }) {
  const { data } = await http.put<WebhookItem>(`/portal/webhooks/${webhookId}`, input);
  return data;
}

export async function toggleWebhook(webhookId: number, enabled: boolean) {
  const { data } = await http.post<WebhookItem>(`/portal/webhooks/${webhookId}/toggle`, { enabled });
  return data;
}

export type WebhookDeliveryLog = {
  id: number;
  webhookId: number;
  event: string;
  targetUrl: string;
  responseStatus: number;
  latencyMs: number;
  success: boolean;
  errorMessage?: string;
  createdAt: string;
};

export async function fetchWebhookDeliveries(webhookId: number) {
  const { data } = await http.get<{ items: WebhookDeliveryLog[] }>(`/portal/webhooks/${webhookId}/deliveries`);
  return data.items ?? [];
}

export async function fetchDocs() {
  const { data } = await http.get<{ items: DocArticle[] }>("/portal/docs");
  return data.items;
}

export async function fetchBilling() {
  const { data } = await http.get<BillingProfile>("/portal/billing");
  return data;
}

export async function fetchBalance() {
  const { data } = await http.get<BalancePayload>("/portal/balance");
  return data;
}

export async function fetchSettings() {
  const { data } = await http.get<UserSettings>("/portal/settings");
  return data;
}

export async function updateSettings(input: {
  displayName: string;
  locale: string;
  timezone: string;
  autoRefreshSeconds: number;
}) {
  const { data } = await http.put<UserSettings>("/portal/settings", input);
  return data;
}

async function downloadBinary(path: string, fallbackFileName: string) {
  const response = await http.get<Blob>(path, {
    responseType: "blob",
  });

  const blob = response.data instanceof Blob ? response.data : new Blob([response.data]);
  const fileName = extractFileName(response.headers["content-disposition"]) ?? fallbackFileName;
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(url);
}

function extractFileName(contentDisposition?: string) {
  if (!contentDisposition) {
    return null;
  }

  const encodedMatch = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (encodedMatch?.[1]) {
    return decodeURIComponent(encodedMatch[1]);
  }

  const plainMatch = contentDisposition.match(/filename="([^"]+)"/i) ?? contentDisposition.match(/filename=([^;]+)/i);
  if (!plainMatch?.[1]) {
    return null;
  }

  return plainMatch[1].trim();
}

function normalizeMailboxMessage(message: MailboxMessageWire): MailboxMessage {
  return {
    ...message,
    legacyMailboxKey: message.legacyMailboxKey ?? "",
    legacyMessageKey: message.legacyMessageKey ?? "",
    headers: message.headers ?? {},
    attachments: message.attachments ?? [],
  };
}

function normalizeMailboxMessageSummary(message: MailboxMessageSummaryWire): MailboxMessageSummary {
  return {
    ...message,
    legacyMailboxKey: message.legacyMailboxKey ?? "",
    legacyMessageKey: message.legacyMessageKey ?? "",
    attachmentCount: message.attachmentCount ?? (message.hasAttachments ? 1 : 0),
  };
}

function normalizeApiKeyItem(item: ApiKeyItem): ApiKeyItem {
  return {
    ...item,
    scopes: item.scopes ?? [],
    domainBindings: item.domainBindings ?? [],
    plainSecret: item.plainSecret,
    resourcePolicy: {
      domainAccessMode: item.resourcePolicy?.domainAccessMode ?? "mixed",
      allowPlatformPublicDomains: item.resourcePolicy?.allowPlatformPublicDomains ?? true,
      allowUserPublishedDomains: item.resourcePolicy?.allowUserPublishedDomains ?? true,
      allowOwnedPrivateDomains: item.resourcePolicy?.allowOwnedPrivateDomains ?? true,
      allowProviderMutation: item.resourcePolicy?.allowProviderMutation ?? false,
      allowProtectedRecordWrite: item.resourcePolicy?.allowProtectedRecordWrite ?? false,
    },
  };
}
