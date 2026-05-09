import type { PropsWithChildren, ReactNode } from "react";
import { Suspense } from "react";
import { Navigate, RouterProvider, createBrowserRouter } from "react-router-dom";
import { ErrorBoundary } from "@/components/layout/error-boundary";
import { NotFoundPage } from "@/components/layout/not-found-page";
import { RouteLoadingScreen } from "@/components/layout/route-loading-screen";
import { lazyRoute } from "./route-modules";
import { getDefaultRouteForRoles } from "../lib/auth";
import { useAuthStore } from "../lib/auth-store";

function RouteBoundary({ children }: { children: ReactNode }) {
  return <Suspense fallback={<RouteLoadingScreen />}>{children}</Suspense>;
}

const LandingPage = lazyRoute("landing", "LandingPage");
const PricingPage = lazyRoute("pricing", "PricingPage");
const UpdatesPage = lazyRoute("updates", "UpdatesPage");
const DocsLandingPage = lazyRoute("docsLanding", "DocsLandingPage");
const FaqPage = lazyRoute("faq", "FaqPage");
const StatsPage = lazyRoute("stats", "StatsPage");
const OAuthCallbackPage = lazyRoute("oauthCallback", "OAuthCallbackPage");
const VerifyEmailPage = lazyRoute("verifyEmail", "VerifyEmailPage");
const ResetPasswordPage = lazyRoute("resetPassword", "ResetPasswordPage");

const UserConsoleLayout = lazyRoute("userConsoleLayout", "UserConsoleLayout");
const UserDashboardPage = lazyRoute("userDashboard", "UserDashboardPage");
const UserMailboxPage = lazyRoute("userMailboxes", "UserMailboxPage");
const UserNoticesPage = lazyRoute("userNotices", "UserNoticesPage");
const UserFeedbackPage = lazyRoute("userFeedback", "UserFeedbackPage");
const UserApiKeysPage = lazyRoute("userApiKeys", "UserApiKeysPage");
const UserDomainsPage = lazyRoute("userDomains", "UserDomainsPage");
const UserDnsPage = lazyRoute("userDns", "UserDnsPage");
const UserExtractorRulesPage = lazyRoute("userExtractors", "UserExtractorRulesPage");
const UserWebhooksPage = lazyRoute("userWebhooks", "UserWebhooksPage");
const UserWebhookLogsPage = lazyRoute("userWebhookLogs", "WebhookLogsPage");
const UserDocsPage = lazyRoute("userDocs", "UserDocsPage");
const UserBillingPage = lazyRoute("userBilling", "UserBillingPage");
const UserBalancePage = lazyRoute("userBalance", "UserBalancePage");
const UserRewardsPage = lazyRoute("userRewards", "UserRewardsPage");
const UserSettingsPage = lazyRoute("userSettings", "UserSettingsPage");

const AdminConsoleLayout = lazyRoute("adminConsoleLayout", "AdminConsoleLayout");
const AdminOverviewPage = lazyRoute("adminOverview", "AdminOverviewPage");
const AdminUsersPage = lazyRoute("adminUsers", "AdminUsersPage");
const AdminMessagesPage = lazyRoute("adminMessages", "AdminMessagesPage");
const AdminMailboxesPage = lazyRoute("adminMailboxes", "AdminMailboxesPage");
const AdminDomainsPage = lazyRoute("adminDomains", "AdminDomainsPage");
const AdminDnsPage = lazyRoute("adminDns", "AdminDnsPage");
const AdminExtractorTemplatesPage = lazyRoute("adminExtractors", "AdminExtractorTemplatesPage");
const AdminRulesPage = lazyRoute("adminRules", "AdminRulesPage");
const AdminApiKeysPage = lazyRoute("adminApiKeys", "AdminApiKeysPage");
const AdminWebhooksPage = lazyRoute("adminWebhooks", "AdminWebhooksPage");
const AdminNoticesPage = lazyRoute("adminNotices", "AdminNoticesPage");
const AdminJobsPage = lazyRoute("adminJobs", "AdminJobsPage");
const AdminDocsPage = lazyRoute("adminDocs", "AdminDocsPage");
const AdminAccountPage = lazyRoute("adminAccount", "AdminAccountPage");
const AdminSettingsPage = lazyRoute("adminSettings", "AdminSettingsPage");
const AdminAuditLogPage = lazyRoute("adminAuditLog", "AdminAuditLogPage");
const AdminMonitoringPage = lazyRoute("adminMonitoring", "AdminMonitoringPage");
const AdminUserDetailPage = lazyRoute("adminUserDetail", "AdminUserDetailPage");

function HomeRoute() {
  const accessToken = useAuthStore((state) => state.accessToken);
  const user = useAuthStore((state) => state.user);

  if (!accessToken || !user) {
    return (
      <RouteBoundary>
        <LandingPage />
      </RouteBoundary>
    );
  }

  return <Navigate replace to={getDefaultRouteForRoles(user.roles)} />;
}

function ProtectedRoute({ children }: PropsWithChildren) {
  const accessToken = useAuthStore((state) => state.accessToken);
  const user = useAuthStore((state) => state.user);

  if (!accessToken || !user) {
    return <Navigate replace to="/" />;
  }

  return children;
}

function AdminRoute({ children }: PropsWithChildren) {
  const accessToken = useAuthStore((state) => state.accessToken);
  const user = useAuthStore((state) => state.user);

  if (!accessToken || !user) {
    return <Navigate replace to="/" />;
  }

  if (!user.roles.includes("admin")) {
    return <Navigate replace to="/dashboard" />;
  }

  return children;
}

const router = createBrowserRouter([
  {
    path: "/",
    element: <HomeRoute />,
  },
  {
    path: "/pricing",
    element: (
      <RouteBoundary>
        <PricingPage />
      </RouteBoundary>
    ),
  },
  {
    path: "/updates",
    element: (
      <RouteBoundary>
        <UpdatesPage />
      </RouteBoundary>
    ),
  },
  {
    path: "/docs",
    element: (
      <RouteBoundary>
        <DocsLandingPage />
      </RouteBoundary>
    ),
  },
  {
    path: "/faq",
    element: (
      <RouteBoundary>
        <FaqPage />
      </RouteBoundary>
    ),
  },
  {
    path: "/stats",
    element: (
      <RouteBoundary>
        <StatsPage />
      </RouteBoundary>
    ),
  },
  {
    path: "/auth/callback/:provider",
    element: (
      <RouteBoundary>
        <OAuthCallbackPage />
      </RouteBoundary>
    ),
  },
  {
    path: "/auth/verify-email",
    element: (
      <RouteBoundary>
        <VerifyEmailPage />
      </RouteBoundary>
    ),
  },
  {
    path: "/auth/reset-password",
    element: (
      <RouteBoundary>
        <ResetPasswordPage />
      </RouteBoundary>
    ),
  },
  {
    path: "/dashboard",
    element: (
      <ProtectedRoute>
        <RouteBoundary>
          <UserConsoleLayout />
        </RouteBoundary>
      </ProtectedRoute>
    ),
    children: [
      {
        index: true,
        element: (
          <RouteBoundary>
            <UserDashboardPage />
          </RouteBoundary>
        ),
      },
      {
        path: "mailboxes",
        element: (
          <RouteBoundary>
            <UserMailboxPage />
          </RouteBoundary>
        ),
      },
      {
        path: "notices",
        element: (
          <RouteBoundary>
            <UserNoticesPage />
          </RouteBoundary>
        ),
      },
      {
        path: "feedback",
        element: (
          <RouteBoundary>
            <UserFeedbackPage />
          </RouteBoundary>
        ),
      },
      {
        path: "api-keys",
        element: (
          <RouteBoundary>
            <UserApiKeysPage />
          </RouteBoundary>
        ),
      },
      {
        path: "domains",
        element: (
          <RouteBoundary>
            <UserDomainsPage />
          </RouteBoundary>
        ),
      },
      {
        path: "dns",
        element: (
          <RouteBoundary>
            <UserDnsPage />
          </RouteBoundary>
        ),
      },
      {
        path: "extractors",
        element: (
          <RouteBoundary>
            <UserExtractorRulesPage />
          </RouteBoundary>
        ),
      },
      {
        path: "webhooks",
        element: (
          <RouteBoundary>
            <UserWebhooksPage />
          </RouteBoundary>
        ),
      },
      {
        path: "webhooks/:id/logs",
        element: (
          <RouteBoundary>
            <UserWebhookLogsPage />
          </RouteBoundary>
        ),
      },
      {
        path: "docs",
        element: (
          <RouteBoundary>
            <UserDocsPage />
          </RouteBoundary>
        ),
      },
      {
        path: "billing",
        element: (
          <RouteBoundary>
            <UserBillingPage />
          </RouteBoundary>
        ),
      },
      {
        path: "balance",
        element: (
          <RouteBoundary>
            <UserBalancePage />
          </RouteBoundary>
        ),
      },
      {
        path: "rewards",
        element: (
          <RouteBoundary>
            <UserRewardsPage />
          </RouteBoundary>
        ),
      },
      {
        path: "settings",
        element: (
          <RouteBoundary>
            <UserSettingsPage />
          </RouteBoundary>
        ),
      },
    ],
  },
  {
    path: "/admin",
    element: (
      <AdminRoute>
        <RouteBoundary>
          <AdminConsoleLayout />
        </RouteBoundary>
      </AdminRoute>
    ),
    children: [
      {
        index: true,
        element: (
          <RouteBoundary>
            <AdminOverviewPage />
          </RouteBoundary>
        ),
      },
      {
        path: "users",
        element: (
          <RouteBoundary>
            <AdminUsersPage />
          </RouteBoundary>
        ),
      },
      {
        path: "messages",
        element: (
          <RouteBoundary>
            <AdminMessagesPage />
          </RouteBoundary>
        ),
      },
      {
        path: "mailboxes",
        element: (
          <RouteBoundary>
            <AdminMailboxesPage />
          </RouteBoundary>
        ),
      },
      {
        path: "domains",
        element: (
          <RouteBoundary>
            <AdminDomainsPage />
          </RouteBoundary>
        ),
      },
      {
        path: "dns",
        element: (
          <RouteBoundary>
            <AdminDnsPage />
          </RouteBoundary>
        ),
      },
      {
        path: "extractors",
        element: (
          <RouteBoundary>
            <AdminExtractorTemplatesPage />
          </RouteBoundary>
        ),
      },
      {
        path: "rules",
        element: (
          <RouteBoundary>
            <AdminRulesPage />
          </RouteBoundary>
        ),
      },
      {
        path: "api-keys",
        element: (
          <RouteBoundary>
            <AdminApiKeysPage />
          </RouteBoundary>
        ),
      },
      {
        path: "webhooks",
        element: (
          <RouteBoundary>
            <AdminWebhooksPage />
          </RouteBoundary>
        ),
      },
      {
        path: "notices",
        element: (
          <RouteBoundary>
            <AdminNoticesPage />
          </RouteBoundary>
        ),
      },
      {
        path: "jobs",
        element: (
          <RouteBoundary>
            <AdminJobsPage />
          </RouteBoundary>
        ),
      },
      {
        path: "docs",
        element: (
          <RouteBoundary>
            <AdminDocsPage />
          </RouteBoundary>
        ),
      },
      {
        path: "account",
        element: (
          <RouteBoundary>
            <AdminAccountPage />
          </RouteBoundary>
        ),
      },
      {
        path: "settings",
        element: (
          <RouteBoundary>
            <AdminSettingsPage />
          </RouteBoundary>
        ),
      },
      {
        path: "audit-logs",
        element: (
          <RouteBoundary>
            <AdminAuditLogPage />
          </RouteBoundary>
        ),
      },
      {
        path: "monitoring",
        element: (
          <RouteBoundary>
            <AdminMonitoringPage />
          </RouteBoundary>
        ),
      },
      {
        path: "users/:id",
        element: (
          <RouteBoundary>
            <AdminUserDetailPage />
          </RouteBoundary>
        ),
      },
    ],
  },
  {
    path: "*",
    element: <NotFoundPage />,
  },
]);

export function AppRouter() {
  return (
    <ErrorBoundary>
      <RouterProvider router={router} />
    </ErrorBoundary>
  );
}
