import type { ComponentType } from "react";
import { lazy } from "react";

const routeModuleLoaders = {
  landing: () => import("../features/home/pages/landing-page"),
  updates: () => import("../features/home/pages/updates-page"),
  docsLanding: () => import("../features/home/pages/docs-landing-page"),
  faq: () => import("../features/home/pages/faq-page"),
  stats: () => import("../features/home/pages/stats-page"),
  oauthCallback: () => import("../features/auth/pages/oauth-callback-page"),
  verifyEmail: () => import("../features/auth/pages/verify-email-page"),
  resetPassword: () => import("../features/auth/pages/reset-password-page"),
  userConsoleLayout: () => import("../features/user/pages/user-console-layout"),
  userDashboard: () => import("../features/user/pages/dashboard-page"),
  userMailboxes: () => import("../features/user/pages/mailboxes-page"),
  userNotices: () => import("../features/user/pages/notices-page"),
  userFeedback: () => import("../features/user/pages/feedback-page"),
  userApiKeys: () => import("../features/user/pages/api-keys-page"),
  userDomains: () => import("../features/user/pages/domains-page"),
  userDns: () => import("../features/user/pages/dns-page"),
  userExtractors: () => import("../features/user/pages/extractor-rules-page"),
  userWebhooks: () => import("../features/user/pages/webhooks-page"),
  userDocs: () => import("../features/user/pages/docs-page"),
  userBilling: () => import("../features/user/pages/billing-page"),
  userBalance: () => import("../features/user/pages/balance-page"),
  userRewards: () => import("../features/user/pages/rewards-page"),
  userSettings: () => import("../features/user/pages/settings-page"),
  adminConsoleLayout: () => import("../features/admin/pages/admin-console-layout"),
  adminOverview: () => import("../features/admin/pages/admin-overview-page"),
  adminUsers: () => import("../features/admin/pages/users-page"),
  adminMessages: () => import("../features/admin/pages/messages-page"),
  adminMailboxes: () => import("../features/admin/pages/mailboxes-page"),
  adminDomains: () => import("../features/admin/pages/domains-page"),
  adminDns: () => import("../features/admin/pages/dns-page"),
  adminExtractors: () => import("../features/admin/pages/extractor-templates-page"),
  adminRules: () => import("../features/admin/pages/rules-page"),
  adminApiKeys: () => import("../features/admin/pages/api-keys-page"),
  adminWebhooks: () => import("../features/admin/pages/webhooks-page"),
  adminNotices: () => import("../features/admin/pages/notices-page"),
  adminJobs: () => import("../features/admin/pages/jobs-page"),
  adminDocs: () => import("../features/admin/pages/docs-page"),
  adminAccount: () => import("../features/admin/pages/account-page"),
  adminSettings: () => import("../features/admin/pages/settings-page"),
  adminAuditLog: () => import("../features/admin/pages/audit-log-page"),
} as const;

export type RouteModuleKey = keyof typeof routeModuleLoaders;

type RouteModule = Awaited<ReturnType<(typeof routeModuleLoaders)[RouteModuleKey]>>;

export function loadRouteModule(key: RouteModuleKey) {
  return routeModuleLoaders[key]();
}

export function lazyRoute<TProps>(key: RouteModuleKey, exportName: string) {
  return lazy(async () => {
    const module = (await loadRouteModule(key)) as RouteModule;

    return {
      default: module[exportName as keyof RouteModule] as ComponentType<TProps>,
    };
  });
}
