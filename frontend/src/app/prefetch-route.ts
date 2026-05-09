import type { RouteModuleKey } from "./route-modules";
import { loadRouteModule } from "./route-modules";

const routePrefetchMap: Record<string, readonly RouteModuleKey[]> = {
  "/": ["landing"],
  "/updates": ["updates"],
  "/docs": ["docsLanding"],
  "/faq": ["faq"],
  "/stats": ["stats"],
  "/dashboard": ["userDashboard"],
  "/dashboard/mailboxes": ["userMailboxes"],
  "/dashboard/notices": ["userNotices"],
  "/dashboard/feedback": ["userFeedback"],
  "/dashboard/api-keys": ["userApiKeys"],
  "/dashboard/domains": ["userDomains"],
  "/dashboard/dns": ["userDns"],
  "/dashboard/extractors": ["userExtractors"],
  "/dashboard/webhooks": ["userWebhooks"],
  "/dashboard/docs": ["userDocs"],
  "/dashboard/billing": ["userBilling"],
  "/dashboard/balance": ["userBalance"],
  "/dashboard/rewards": ["userRewards"],
  "/dashboard/settings": ["userSettings"],
  "/admin": ["adminOverview"],
  "/admin/users": ["adminUsers"],
  "/admin/messages": ["adminMessages"],
  "/admin/mailboxes": ["adminMailboxes"],
  "/admin/domains": ["adminDomains"],
  "/admin/dns": ["adminDns"],
  "/admin/extractors": ["adminExtractors"],
  "/admin/rules": ["adminRules"],
  "/admin/api-keys": ["adminApiKeys"],
  "/admin/webhooks": ["adminWebhooks"],
  "/admin/notices": ["adminNotices"],
  "/admin/jobs": ["adminJobs"],
  "/admin/docs": ["adminDocs"],
  "/admin/account": ["adminAccount"],
  "/admin/settings": ["adminSettings"],
  "/admin/audit-logs": ["adminAuditLog"],
};

const prefetchedKeys = new Set<RouteModuleKey>();
const inflightPrefetches = new Map<RouteModuleKey, Promise<void>>();

function normalizePrefetchTarget(target: string) {
  const [withoutHash] = target.split("#");
  const [pathname] = withoutHash.split("?");

  if (!pathname) {
    return "/";
  }

  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }

  return pathname;
}

export function getRoutePrefetchKeys(target: string): RouteModuleKey[] {
  const pathname = normalizePrefetchTarget(target);
  const keys = routePrefetchMap[pathname];

  return keys ? [...keys] : [];
}

function prefetchRouteModule(key: RouteModuleKey) {
  if (prefetchedKeys.has(key)) {
    return Promise.resolve();
  }

  const existingPromise = inflightPrefetches.get(key);
  if (existingPromise) {
    return existingPromise;
  }

  const promise = loadRouteModule(key)
    .then(() => {
      prefetchedKeys.add(key);
    })
    .finally(() => {
      inflightPrefetches.delete(key);
    });

  inflightPrefetches.set(key, promise);
  return promise;
}

export async function prefetchRoute(target: string) {
  const keys = getRoutePrefetchKeys(target);
  await Promise.all(keys.map((key) => prefetchRouteModule(key)));
}

export function createRoutePrefetchHandlers(target: string) {
  const triggerPrefetch = () => {
    void prefetchRoute(target);
  };

  return {
    onFocus: triggerPrefetch,
    onMouseEnter: triggerPrefetch,
    onTouchStart: triggerPrefetch,
  };
}
